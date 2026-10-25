import { t } from '../shared/i18n';
import { BrowserWindow, desktopCapturer, nativeImage, screen, type NativeImage } from 'electron';
import { ensureScreenCaptureAccess } from './screen-capture-access';
import {
  capturePlan,
  desktopBounds,
  type CaptureState,
  type CaptureFrame,
  type CaptureDestination,
  type WindowRect,
} from '../shared/capture';
interface Frame extends CaptureFrame {
  image: NativeImage;
}
export class ScreenCapture {
  private active: {
    window?: BrowserWindow;
    frames: Frame[];
    previous: BrowserWindow[];
    done: () => void;
    reject: (e: Error) => void;
    finish: (image: Buffer, destination: CaptureDestination) => Promise<void>;
    destination: CaptureDestination;
    generation: number;
  } | null = null;
  private generation = 0;
  constructor(
    private open: (
      state: CaptureState,
      bounds: WindowRect,
      preview: boolean,
    ) => Promise<BrowserWindow>,
    private restoreOnSuccess: (w: BrowserWindow) => boolean,
  ) {
    screen.on('display-added', this.displayChanged);
    screen.on('display-removed', this.displayChanged);
    screen.on('display-metrics-changed', this.displayChanged);
  }
  get busy() {
    return !!this.active;
  }
  private displayChanged = () => {
    if (this.active) this.cancel(new Error(t('显示器配置已改变，请重新截图')));
  };
  async start(
    mode: 'region' | 'screen',
    destination: CaptureDestination,
    finish: (image: Buffer, destination: CaptureDestination) => Promise<void>,
  ) {
    if (this.active) throw Error(t('已有截图正在进行'));
    let done!: () => void, reject!: (e: Error) => void;
    const completed = new Promise<void>((r, j) => {
      done = r;
      reject = j;
    });
    // Mark busy before asynchronous desktop capture; cancel invalidates late results.
    const current = {
      frames: [] as Frame[],
      previous: [] as BrowserWindow[],
      done,
      reject,
      finish,
      destination,
      generation: ++this.generation,
      window: undefined as BrowserWindow | undefined,
    };
    this.active = current;
    try {
      await ensureScreenCaptureAccess();
      if (this.active !== current) return completed;
      const cursor = screen.getCursorScreenPoint(),
        selected = screen.getDisplayNearestPoint(cursor),
        displays = screen.getAllDisplays();
      current.previous = BrowserWindow.getAllWindows().filter((w) => w.isVisible());
      for (const w of current.previous) w.hide();
      await new Promise((r) => setTimeout(r, 150));
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.max(...displays.map((d) => Math.ceil(d.bounds.width * d.scaleFactor))),
          height: Math.max(...displays.map((d) => Math.ceil(d.bounds.height * d.scaleFactor))),
        },
      });
      if (this.active !== current) return completed;
      let preview = false;
      for (const source of sources) {
        if (source.thumbnail.isEmpty()) continue;
        const image = nativeImage.createFromBuffer(source.thumbnail.toPNG()),
          display = displays.find((d) => String(d.id) === source.display_id);
        if (!display && process.platform !== 'linux')
          throw Error(t('无法确定截图对应的显示器，请重新截图'));
        const pixels = image.getSize();
        if (pixels.width * pixels.height > 36_000_000) throw Error(t('单屏图像超过 3600 万像素'));
        const area = selected.workArea,
          ratio = Math.min(
            1,
            (area.width - 80) / pixels.width,
            (area.height - 100) / pixels.height,
          );
        const bounds = display
          ? display.bounds
          : {
              x: 0,
              y: 0,
              width: Math.round(pixels.width * ratio),
              height: Math.round(pixels.height * ratio),
            };
        preview ||= !display;
        current.frames.push({ id: source.id, bounds, pixels, image });
      }
      if (!current.frames.length)
        throw Error(t('没有取得屏幕图像，可能已取消系统选择器或未授予权限'));
      if (mode === 'screen') {
        const frame = preview
          ? current.frames[0]
          : current.frames.find(
              (f) => f.bounds.x === selected.bounds.x && f.bounds.y === selected.bounds.y,
            );
        if (!frame) throw Error(t('当前显示器不可截图'));
        await this.complete(frame.bounds, destination);
        return completed;
      }
      const bounds = desktopBounds(current.frames),
        state: CaptureState = {
          bounds,
          frames: current.frames.map(({ image, ...frame }) => ({
            ...frame,
            data: image.toDataURL(),
          })),
          mode,
        };
      const windowBounds = preview
        ? {
            ...bounds,
            x: Math.round(selected.workArea.x + (selected.workArea.width - bounds.width) / 2),
            y: Math.round(selected.workArea.y + (selected.workArea.height - bounds.height) / 2),
          }
        : bounds;
      current.window = await this.open(state, windowBounds, preview);
      if (this.active !== current) {
        current.window.destroy();
        return completed;
      }
      current.window.once('closed', () => {
        if (this.active === current) this.cancel();
      });
      current.window.setAlwaysOnTop(true, 'screen-saver');
      current.window.show();
      current.window.focus();
    } catch (error) {
      if (this.active === current) this.cancel(error as Error);
    }
    return completed;
  }
  owns(id: number) {
    return this.active?.window?.webContents.id === id;
  }
  crop(rect: WindowRect): Buffer {
    const current = this.active;
    if (!current) throw Error(t('截图已结束'));
    const plan = capturePlan(rect, current.frames),
      bitmap = Buffer.alloc(plan.size.width * plan.size.height * 4);
    for (const part of plan.parts) {
      const source = current.frames.find((f) => f.id === part.id)!,
        image = source.image.crop(part.source).resize({ ...part.destination, quality: 'best' }),
        bytes = image.toBitmap();
      for (let row = 0; row < part.destination.height; row++)
        bytes.copy(
          bitmap,
          ((part.destination.y + row) * plan.size.width + part.destination.x) * 4,
          row * part.destination.width * 4,
          (row + 1) * part.destination.width * 4,
        );
    }
    const image = nativeImage.createFromBitmap(bitmap, plan.size),
      png = image.toPNG();
    if (png.length > 20 * 1024 * 1024) throw Error(t('截图超过 20 MB，请缩小区域'));
    return png;
  }
  async sample(rect: WindowRect): Promise<Buffer> {
    const current = this.active;
    if (!current?.window || process.platform === 'linux')
      throw new Error(t('此平台暂不支持在长截图中重新采集，请使用普通截图'));
    current.window.hide();
    try {
      // The user scrolls manually while the overlay is hidden. No input is synthesized.
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (this.active !== current) throw new Error(t('截图已取消'));
      const displays = screen.getAllDisplays();
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.max(...displays.map((d) => Math.ceil(d.bounds.width * d.scaleFactor))),
          height: Math.max(...displays.map((d) => Math.ceil(d.bounds.height * d.scaleFactor))),
        },
      });
      if (this.active !== current) throw new Error(t('截图已取消'));
      const frames = sources
        .filter((s) => !s.thumbnail.isEmpty())
        .map((source) => {
          const display = displays.find((d) => String(d.id) === source.display_id);
          if (!display) throw new Error(t('无法确定截图对应的显示器'));
          const image = nativeImage.createFromBuffer(source.thumbnail.toPNG());
          return { id: source.id, bounds: display.bounds, pixels: image.getSize(), image };
        });
      const original = current.frames;
      try {
        current.frames = frames;
        return this.crop(rect);
      } finally {
        current.frames = original;
      }
    } finally {
      if (this.active === current && !current.window.isDestroyed()) {
        current.window.show();
        current.window.focus();
      }
    }
  }
  async complete(rect: WindowRect, destination?: CaptureDestination, edited?: Buffer) {
    const current = this.active;
    if (!current) throw new Error(t('截图已结束'));
    const png = edited ?? this.crop(rect);
    this.active = null;
    current.window?.destroy();
    for (const w of current.previous)
      if (!w.isDestroyed() && this.restoreOnSuccess(w)) w.showInactive();
    try {
      await current.finish(png, destination || current.destination);
      current.done();
    } catch (error) {
      for (const w of current.previous) if (!w.isDestroyed()) w.show();
      current.reject(error as Error);
    }
  }
  cancel(error?: Error) {
    const current = this.active;
    if (!current) return;
    this.active = null;
    ++this.generation;
    current.window?.destroy();
    for (const w of current.previous) if (!w.isDestroyed()) w.show();
    if (error) current.reject(error);
    else current.done();
  }
  close() {
    this.cancel();
    screen.off('display-added', this.displayChanged);
    screen.off('display-removed', this.displayChanged);
    screen.off('display-metrics-changed', this.displayChanged);
  }
}
