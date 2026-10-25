import { localizeCommand } from '../shared/localized-command';
import { t } from '../shared/i18n';
import {
  BrowserWindow,
  clipboard,
  ClipboardItem,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  screen,
  type NativeImage,
} from 'electron';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ScreenCapture } from './screen-capture';
import { isHostDocument } from './host-origin';
import type { DesktopToolState, ImageToolState } from '../shared/desktop-tools';
import type { CaptureDestination, WindowRect } from '../shared/capture';
import type { Command } from '../shared/types';
import type { CapabilityProviders } from './capability-providers';
import type { CaptureEditorState } from '../shared/capture-editor';
import { findVerticalOverlap, imageSize, renderAnnotations, stitchImages } from './capture-image';
interface Session {
  editor?: {
    rect: WindowRect;
    bytes: Buffer;
    segments: { bytes: Buffer; overlap: number; uncertain: boolean; height: number }[];
  };
  editorBusy?: boolean;
  recognition?: AbortController;
  window: BrowserWindow;
  state: DesktopToolState;
  image?: NativeImage;
  zoom: number;
}
interface Dependencies {
  capabilities?: CapabilityProviders;
  launcher: (image: Buffer | string) => Promise<void>;
  theme: () => string;
  enabled: (id: string) => void;
}
const destinations: CaptureDestination[] = ['launcher', 'copy', 'save', 'pin'];
export class DesktopTools {
  readonly capture: ScreenCapture;
  private sessions = new Map<number, Session>();
  constructor(
    private html: string,
    private deps: Dependencies,
  ) {
    this.capture = new ScreenCapture(
      async (state, bounds, preview) =>
        (await this.open({ kind: 'capture', ...state }, bounds, !preview)).window,
      (w) => this.sessions.get(w.webContents.id)?.state.kind === 'pin',
    );
    ipcMain.handle('desktop-tools', async (event, action: unknown, payload: unknown) => {
      const session = this.sessions.get(event.sender.id);
      if (
        !session ||
        event.senderFrame !== event.sender.mainFrame ||
        !isHostDocument(event.senderFrame.url, this.html)
      )
        throw Error(t('不允许的调用来源'));
      return this.handle(session, action, payload);
    });
  }
  get busy() {
    return this.capture.busy;
  }
  private async open(state: DesktopToolState, bounds: WindowRect, overlay = false) {
    const pin = state.kind === 'pin',
      window = new BrowserWindow({
        ...bounds,
        show: false,
        frame: false,
        resizable: false,
        alwaysOnTop: pin || overlay,
        skipTaskbar: true,
        fullscreenable: false,
        enableLargerThanScreen: overlay || pin,
        backgroundColor: '#242528',
        title: 'Nexlet · ' + (pin ? t('贴图') : t('截图')),
        webPreferences: {
          preload: path.join(__dirname, '../preload/desktop-tools.cjs'),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          spellcheck: false,
        },
      });
    const owner = window.webContents.id,
      session: Session = { window, state, zoom: 1 };
    this.sessions.set(owner, session);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (e) => e.preventDefault());
    window.webContents.on('will-attach-webview', (e) => e.preventDefault());
    window.on('closed', () => {
      session.recognition?.abort();
      this.sessions.delete(owner);
    });
    if (overlay || pin) {
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      window.setAlwaysOnTop(true, overlay ? 'screen-saver' : 'floating');
    }
    try {
      await window.loadFile(this.html, { query: { desktop: state.kind } });
      return session;
    } catch (error) {
      window.destroy();
      throw error;
    }
  }
  private changed(s: Session) {
    if (!s.window.isDestroyed()) s.window.webContents.send('desktop-change');
  }
  private image(bytes: Buffer) {
    if (bytes.length > 20 * 1024 * 1024) throw Error(t('图片超过 20 MB'));
    const image = nativeImage.createFromBuffer(bytes),
      size = image.getSize();
    if (image.isEmpty() || size.width * size.height > 36_000_000)
      throw Error(t('图片无效或超过 3600 万像素'));
    return image;
  }
  private base(kind: 'pin', image?: NativeImage): ImageToolState {
    return {
      kind,
      image: image?.toDataURL(),
      theme:
        this.deps.theme() === 'system'
          ? nativeTheme.shouldUseDarkColors
            ? 'dark'
            : 'light'
          : this.deps.theme(),
    };
  }
  async screenshot(mode: 'region' | 'screen', destination: CaptureDestination = 'launcher') {
    await this.capture.start(mode, destination, async (image, to) => {
      if (to === 'pin') this.deps.enabled('image:pin');
      await this.output(image, to);
    });
  }
  private async output(bytes: Buffer, destination: CaptureDestination, owner?: BrowserWindow) {
    const image = this.image(bytes);
    if (destination === 'copy') {
      await clipboard.write([
        new ClipboardItem({
          'image/png': new Blob([new Uint8Array(image.toPNG())], { type: 'image/png' }),
        }),
      ]);
      return;
    }
    if (destination === 'save') {
      const options = {
        title: t('保存截图'),
        defaultPath: 'Nexlet-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png',
        filters: [{ name: t('PNG 图片'), extensions: ['png'] }],
      };
      const result = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);
      if (!result.canceled && result.filePath) await writeFile(result.filePath, image.toPNG());
      return;
    }
    if (destination === 'pin') {
      await this.pin(bytes);
      return;
    }
    await this.deps.launcher(image.toPNG());
  }
  async pin(bytes: Buffer) {
    this.deps.enabled('image:pin');
    const image = this.image(bytes),
      size = image.getSize(),
      area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,
      ratio = Math.min(1, (area.width - 60) / size.width, (area.height - 110) / size.height);
    const width = Math.max(320, Math.round(size.width * ratio)),
      height = Math.max(100, Math.round(size.height * ratio)) + 40;
    const s = await this.open(this.base('pin', image), {
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
      width,
      height,
    });
    s.image = image;
    s.zoom = ratio;
    s.window.show();
    return s.window;
  }
  private async handle(s: Session, action: unknown, payload: unknown): Promise<unknown> {
    if (action === 'state') return s.state;
    if (action === 'providers')
      return this.deps.capabilities?.state() ?? { providers: [], defaults: {} };
    if (action === 'recognitionCancel') {
      s.recognition?.abort();
      return true;
    }
    if (action === 'recognize' || action === 'translate') {
      if (!this.deps.capabilities) throw new Error(t('提供商注册表未初始化'));
      if (s.recognition) throw new Error(t('识别正在进行'));
      const args = (payload ?? {}) as {
        annotations?: unknown;
        ocrProviderId?: string;
        translationProviderId?: string;
        targetLanguage?: string;
      };
      const source = s.editor?.bytes ?? s.image?.toPNG();
      if (!source) throw new Error(t('请先选择截图区域'));
      const controller = new AbortController();
      s.recognition = controller;
      try {
        const bytes = await renderAnnotations(source, args.annotations ?? []);
        const recognized = await this.deps.capabilities.run(
          { capability: 'ocr', image: new Uint8Array(bytes), providerId: args.ocrProviderId },
          controller.signal,
        );
        if (action === 'recognize') return recognized;
        if (!recognized.text.trim()) throw new Error(t('图片中没有识别到文字'));
        return await this.deps.capabilities.run(
          {
            capability: 'translation',
            text: recognized.text,
            providerId: args.translationProviderId,
            targetLanguage: args.targetLanguage ?? 'zh-CN',
          },
          controller.signal,
        );
      } finally {
        if (s.recognition === controller) s.recognition = undefined;
      }
    }
    if (action === 'resultCopy' && typeof payload === 'string' && payload.length <= 500000) {
      await clipboard.writeText(payload);
      return true;
    }
    if (action === 'resultLaunch' && typeof payload === 'string' && payload.length <= 500000) {
      await this.deps.launcher(payload);
      if (s.state.kind === 'capture') this.capture.cancel();
      else s.window.close();
      return true;
    }
    if (action === 'cancel') {
      if (s.state.kind === 'capture') this.capture.cancel();
      else s.window.close();
      return;
    }
    if (s.state.kind === 'capture') {
      if (!this.capture.owns(s.window.webContents.id)) throw new Error(t('截图已结束'));
      if (['edit', 'append', 'overlap', 'removeSegment', 'preview'].includes(String(action))) {
        if (s.editorBusy) throw new Error(t('截图处理正在进行'));
        s.editorBusy = true;
        try {
          return await this.editCapture(s, String(action), payload);
        } finally {
          s.editorBusy = false;
        }
      }
      if (
        action !== 'complete' ||
        !payload ||
        typeof payload !== 'object' ||
        !this.capture.owns(s.window.webContents.id)
      )
        throw Error(t('截图操作无效'));
      const { rect, destination, annotations } = payload as {
        rect: WindowRect;
        destination?: CaptureDestination;
        annotations?: unknown;
      };
      if (destination !== undefined && !destinations.includes(destination))
        throw Error(t('截图目标无效'));
      if (s.editorBusy) throw new Error(t('截图处理正在进行'));
      const edited = s.editor
        ? await renderAnnotations(s.editor.bytes, annotations ?? [])
        : undefined;
      return this.capture.complete(s.editor?.rect ?? rect, destination, edited);
    }
    if (!s.image) throw Error(t('请先选择图片'));
    if (action === 'copy' || action === 'save' || action === 'launch' || action === 'pin') {
      const destination = action === 'launch' ? 'launcher' : action;
      await this.output(s.image.toPNG(), destination, s.window);
      if (action === 'launch') s.window.close();
      return;
    }
    if (action === 'rotate') {
      const image = s.image,
        { width, height } = image.getSize(),
        bytes = image.toBitmap(),
        input = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4),
        buffer = Buffer.alloc(bytes.length),
        output = new Uint32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) output[x * height + height - 1 - y] = input[y * width + x];
      s.image = nativeImage.createFromBitmap(buffer, { width: height, height: width });
      s.state.image = s.image.toDataURL();
      if (s.state.kind === 'pin') this.resizePin(s);
      this.changed(s);
      return;
    }
    if (action === 'zoom' && s.state.kind === 'pin') {
      if (typeof payload !== 'number' || !Number.isFinite(payload) || Math.abs(payload) > 1)
        throw Error(t('缩放参数无效'));
      s.zoom = Math.min(4, Math.max(0.1, s.zoom + payload));
      this.resizePin(s);
      return;
    }
    throw Error(t('不支持的图片操作'));
  }
  private async editCapture(
    s: Session,
    action: string,
    payload: unknown,
  ): Promise<CaptureEditorState> {
    const args = (payload ?? {}) as {
      rect?: WindowRect;
      index?: number;
      overlap?: number;
      annotations?: unknown;
    };
    if (action === 'edit') {
      const bytes = this.capture.crop(args.rect!),
        size = await imageSize(bytes);
      s.editor = {
        rect: args.rect!,
        bytes,
        segments: [{ bytes, overlap: 0, uncertain: false, height: size.height }],
      };
    }
    const editor = s.editor;
    if (!editor) throw new Error(t('请先选择截图区域'));
    if (action === 'append') {
      if (editor.segments.length >= 30) throw new Error(t('长截图最多 30 个片段'));
      const bytes = await this.capture.sample(editor.rect),
        match = await findVerticalOverlap(editor.segments.at(-1)!.bytes, bytes),
        size = await imageSize(bytes);
      if (match.duplicate) throw new Error(t('画面没有变化，请滚动后重新采集'));
      const segments = [
        ...editor.segments,
        {
          bytes,
          overlap: match.overlap ?? 0,
          uncertain: match.overlap === null,
          height: size.height,
        },
      ];
      const combined = await stitchImages(segments);
      editor.segments = segments;
      editor.bytes = combined;
    }
    if (action === 'overlap' || action === 'removeSegment') {
      const index = args.index;
      if (!Number.isInteger(index) || index! < 1 || index! >= editor.segments.length)
        throw new Error(t('片段序号无效'));
      const segments = editor.segments.map((segment) => ({ ...segment }));
      if (action === 'removeSegment') {
        segments.splice(index!, 1);
        if (segments[index!]) {
          segments[index!].overlap = 0;
          segments[index!].uncertain = true;
        }
      } else {
        segments[index!].overlap = args.overlap!;
        segments[index!].uncertain = false;
      }
      const combined = await stitchImages(segments);
      editor.segments = segments;
      editor.bytes = combined;
    }
    const bytes =
      action === 'preview'
        ? await renderAnnotations(editor.bytes, args.annotations ?? [])
        : editor.bytes;
    return {
      data: 'data:image/png;base64,' + bytes.toString('base64'),
      ...(await imageSize(bytes)),
      segments: editor.segments.map(({ height, overlap, uncertain }) => ({
        height,
        overlap,
        uncertain,
      })),
    };
  }
  private resizePin(s: Session) {
    const size = s.image!.getSize(),
      old = s.window.getBounds(),
      area = screen.getDisplayMatching(old).workArea;
    const width = Math.max(320, Math.min(area.width * 2, Math.round(size.width * s.zoom))),
      height = Math.max(100, Math.min(area.height * 2, Math.round(size.height * s.zoom))) + 40;
    s.window.setBounds({
      x: Math.round(old.x + (old.width - width) / 2),
      y: Math.round(old.y + (old.height - height) / 2),
      width,
      height,
    });
  }
  refreshLocale() {
    for (const s of this.sessions.values())
      s.window.setTitle('Nexlet · ' + (s.state.kind === 'pin' ? t('贴图') : t('截图')));
  }
  close() {
    this.capture.close();
    for (const s of this.sessions.values()) s.window.destroy();
    this.sessions.clear();
    ipcMain.removeHandler('desktop-tools');
  }
}
export function desktopCommands(): Command[] {
  const imageMatches = [
    { type: 'image' as const },
    {
      type: 'files' as const,
      extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'],
      minCount: 1,
      maxCount: 1,
      fileType: 'file' as const,
    },
  ];
  const commands: Command[] = [
    {
      id: 'capture:region',
      name: t('截图'),
      subtitle: t('框选区域，复制、保存或继续处理'),
      kind: 'system',
      keywords: [t('截图'), 'screenshot', 'capture', 'jt'],
      color: '#528aef',
    },
    {
      id: 'capture:screen',
      name: t('当前屏截图'),
      subtitle: t('截取鼠标所在显示器；Linux 由系统选择屏幕'),
      kind: 'system',
      keywords: [t('全屏截图'), 'fullscreen'],
      color: '#528aef',
    },
    {
      id: 'image:pin',
      name: t('贴图'),
      subtitle: t('将图片悬浮在屏幕上，随时对照'),
      kind: 'system',
      keywords: [t('贴图'), t('图片置顶'), 'pin'],
      matches: imageMatches,
      color: '#ba8951',
    },
  ];
  return commands.map(localizeCommand);
}
