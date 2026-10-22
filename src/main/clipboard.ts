import { t } from '../shared/i18n';
import { clipboard, ClipboardItem as ElectronClipboardItem } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { ClipItem } from '../shared/types';
import type { ClipboardStorage } from './clipboard-store';
import type { Platform } from './platform';
import { shouldRecordClipboard, textClipboardHash } from '../shared/clipboard';
import { ClipboardImages } from './clipboard-image';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export class ClipboardService {
  onCaptured: ((item: ClipItem) => void) | undefined;
  foreground: (() => Promise<{ app: string; name?: string } | null>) | undefined;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private pending: Promise<void> = Promise.resolve();
  private paused = 0;
  private lastSequence: number | null = null;
  private lastHash = '';
  error: string | null = null;
  constructor(
    private store: ClipboardStorage,
    private platform: Platform,
    private changed: () => void,
    private images = new ClipboardImages(),
  ) {}
  start(): void {
    this.timer = setInterval(() => void this.capture(), 700);
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  async close(): Promise<void> {
    this.stop();
    this.paused++;
    await this.pending;
    this.images.close();
  }
  async withoutCapture<T>(work: () => Promise<T>): Promise<T> {
    this.paused++;
    await this.pending;
    try {
      return await work();
    } finally {
      this.paused--;
    }
  }
  async capture(force = false): Promise<void> {
    if (this.paused) return;
    if (this.busy) {
      if (force) {
        await this.pending;
        return this.capture(true);
      }
      return;
    }
    const sequence = this.platform.sequence();
    if (!force && sequence !== null && sequence === this.lastSequence) return;
    const settings = this.store.settings();
    if (!force && !shouldRecordClipboard(settings, null)) {
      this.lastSequence = sequence;
      return;
    }
    this.busy = true;
    let idle!: () => void;
    this.pending = new Promise((resolve) => {
      idle = resolve;
    });
    try {
      if (!force && settings.clipboardExcludedApps.length) {
        const source = (await this.foreground?.().catch(() => null)) ?? null;
        if (!shouldRecordClipboard(settings, source)) {
          this.lastSequence = sequence;
          return;
        }
      }
      const contents = await clipboard.read();
      const formats = contents.flatMap((item) => item.types);
      // Respect common password-manager and transient clipboard markers.
      if (
        formats.some((f) =>
          /org\.nspasteboard\.(ConcealedType|TransientType)|ExcludeClipboardContentFromMonitorProcessing|application\/x-keepassxc/i.test(
            f,
          ),
        )
      ) {
        this.lastSequence = sequence;
        return;
      }
      let files: string[] = [];
      if (
        process.platform === 'win32' ||
        formats.some((f) =>
          /file-url|NSFilenamesPboardType|text\/uri-list|x-special\/gnome-copied-files/.test(f),
        )
      )
        files = await this.platform.readFiles();
      let item: ClipItem | undefined;
      const base = { id: randomUUID(), createdAt: Date.now(), favorite: false };
      if (files.length)
        item = {
          ...base,
          kind: 'files',
          text: files.join('\n'),
          hash: hash('files:' + files.join('\0')),
          files,
        };
      else {
        const imageItem = contents.find((item) => item.types.includes('image/png'));
        const imageBlob = imageItem ? await imageItem.getType('image/png') : null;
        const picture =
          imageBlob instanceof Blob
            ? await this.images.capture(
                new Uint8Array(await imageBlob.arrayBuffer()),
                this.store.images,
              )
            : null;
        if (picture) {
          const { width, height } = picture;
          item = {
            ...base,
            ...picture,
            kind: 'image',
            text: t('图片 {{v0}} × {{v1}}', { v0: width, v1: height }),
          };
        } else {
          const text = await clipboard.readText();
          if (text && Buffer.byteLength(text) <= 2 * 1024 * 1024) {
            const htmlItem = contents.find((item) => item.types.includes('text/html'));
            const htmlBlob = htmlItem ? await htmlItem.getType('text/html') : null;
            const html =
              htmlBlob instanceof Blob && htmlBlob.size <= 2 * 1024 * 1024
                ? await htmlBlob.text()
                : undefined;
            item = {
              ...base,
              kind: 'text',
              text,
              ...(html ? { html } : {}),
              hash: hash(textClipboardHash(text, html)),
            };
          }
        }
      }
      if (item && (item.hash !== this.lastHash || !(await this.store.hasClipHash(item.hash)))) {
        const saved = await this.store.addClip(item);
        await this.store.prune();
        this.onCaptured?.(saved);
        this.lastHash = item.hash;
        this.changed();
      }
      if (!item) this.lastHash = '';
      this.lastSequence = sequence;
      this.error = null;
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.busy = false;
      idle();
    }
  }
  async importImage(bytes: Uint8Array): Promise<ClipItem> {
    if (bytes.byteLength > 20 * 1024 * 1024) throw Error(t('图片超过 20 MB，无法导入'));
    const image = await this.images.capture(bytes, this.store.images);
    if (!image) throw Error(t('无法识别图片'));
    const item = await this.store.addClip({
      ...image,
      id: randomUUID(),
      kind: 'image',
      text: t('图片 {{v0}} × {{v1}}', { v0: image.width, v1: image.height }),
      createdAt: Date.now(),
      favorite: false,
    });
    await this.store.prune();
    this.changed();
    return item;
  }
  async copy(ids: string[], plain = false): Promise<void> {
    const items = await Promise.all(ids.map((id) => this.store.clip(id)));
    if (!items.length || items.some((i) => !i)) throw new Error(t('请选择仍存在的记录'));
    const selected = items as ClipItem[];
    if (selected.every((i) => i.kind === 'text')) {
      const text = selected.map((i) => i.text).join('\n');
      const html = !plain && selected.length === 1 ? selected[0].html : undefined;
      if (html)
        await clipboard.write([
          new ElectronClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
          }),
        ]);
      else await clipboard.writeText(text);
      this.lastHash = hash(textClipboardHash(text, html));
    } else if (selected.every((i) => i.kind === 'files')) {
      const files = [...new Set(selected.flatMap((i) => i.files || []))];
      if (files.some((file) => !existsSync(file))) throw new Error(t('部分原文件已移动或删除'));
      await this.platform.writeFiles(files);
      this.lastHash = hash('files:' + files.join('\0'));
    } else if (selected.length === 1 && selected[0].kind === 'image') {
      const png = await this.images.copy(selected[0].imagePath || '');
      await clipboard.write([
        new ElectronClipboardItem({
          'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }),
        }),
      ]);
      this.lastHash = selected[0].hash;
    } else throw new Error(t('合并复制支持多条文本或多个文件；图片请单独选择'));
    this.lastSequence = this.platform.sequence();
    await this.store.touchClips(ids);
    this.changed();
  }
}
