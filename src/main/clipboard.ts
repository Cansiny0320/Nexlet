import { t } from '../shared/i18n';
import { clipboard, ClipboardItem as ElectronClipboardItem, nativeImage } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { ClipItem } from '../shared/types';
import type { Store } from './store';
import type { Platform } from './platform';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export class ClipboardService {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private pending:Promise<void>=Promise.resolve();
  private paused = 0;
  private lastSequence: number | null = null;
  private lastHash = '';
  error: string | null = null;
  constructor(private store: Store, private platform: Platform, private changed: () => void) {}
  start(): void { this.timer = setInterval(() => void this.capture(), 700); }
  stop(): void { if (this.timer) clearInterval(this.timer); }
  async withoutCapture<T>(work:()=>Promise<T>):Promise<T>{
    this.paused++;
    await this.pending;
    try{return await work();}finally{this.paused--;}
  }
  async capture(force = false): Promise<void> {
    if(this.paused)return;
    if(this.busy){if(force){await this.pending;return this.capture(true);}return;}
    if(!force && !this.store.settings().clipboardEnabled)return;
    const sequence = this.platform.sequence();
    if (!force && sequence !== null && sequence === this.lastSequence) return;
    this.busy = true;
    let idle!:()=>void;this.pending=new Promise(resolve=>{idle=resolve;});
    try {
      const contents = await clipboard.read();
      const formats = contents.flatMap(item => item.types);
      // Respect common password-manager and transient clipboard markers.
      if (formats.some(f => /org\.nspasteboard\.(ConcealedType|TransientType)|ExcludeClipboardContentFromMonitorProcessing|application\/x-keepassxc/i.test(f))) { this.lastSequence = sequence; return; }
      let files: string[] = [];
      if (process.platform === 'win32' || formats.some(f => /file-url|NSFilenamesPboardType|text\/uri-list|x-special\/gnome-copied-files/.test(f))) files = await this.platform.readFiles();
      let item: ClipItem | undefined;
      const base = { id: randomUUID(), createdAt: Date.now(), favorite: false };
      if (files.length) item = { ...base, kind: 'files', text: files.join('\n'), hash: hash('files:' + files.join('\0')), files };
      else {
        const imageItem = contents.find(item => item.types.includes('image/png'));
        const imageBlob = imageItem ? await imageItem.getType('image/png') : null;
        const picture = imageBlob instanceof Blob ? nativeImage.createFromBuffer(Buffer.from(await imageBlob.arrayBuffer())) : nativeImage.createEmpty();
        if (!picture.isEmpty()) {
          const { width, height } = picture.getSize();
          if (width * height > 36_000_000) throw new Error(t("图片过大，本次未记录（最多 3600 万像素）"));
          const png = picture.toPNG();
          if (png.length > 20 * 1024 * 1024) throw new Error(t("图片超过 20 MB，本次未记录"));
          const fingerprint = hash(png);
          if (fingerprint === this.lastHash && this.store.hasClipHash(fingerprint)) { this.lastSequence = sequence; return; }
          const imagePath = path.join(this.store.images, fingerprint + '.png');
          if (!existsSync(imagePath)) writeFileSync(imagePath, png);
          const thumbnail = picture.resize({ width: Math.min(360, width) }).toDataURL();
          item = { ...base, kind: 'image', text: t("图片 {{v0}} × {{v1}}", { v0: width, v1: height }), hash: fingerprint, imagePath, thumbnail, width, height };
        } else {
          const text = await clipboard.readText();
          if (text && Buffer.byteLength(text) <= 2 * 1024 * 1024) item = { ...base, kind: 'text', text, hash: hash('text:' + text) };
        }
      }
      if (item && (item.hash !== this.lastHash || !this.store.hasClipHash(item.hash))) { this.store.addClip(item); this.store.prune(); this.lastHash = item.hash; this.changed(); }
      if (!item) this.lastHash = '';
      this.lastSequence = sequence; this.error = null;
    } catch (error) { this.error = (error as Error).message; }
    finally { this.busy = false;idle(); }
  }
  async copy(ids: string[]): Promise<void> {
    const items = ids.map(id => this.store.clip(id));
    if (!items.length || items.some(i => !i)) throw new Error(t("请选择仍存在的记录"));
    const selected = items as ClipItem[];
    if (selected.every(i => i.kind === 'text')) {
      const text = selected.map(i => i.text).join('\n'); await clipboard.writeText(text); this.lastHash = hash('text:' + text);
    } else if (selected.every(i => i.kind === 'files')) {
      const files = [...new Set(selected.flatMap(i => i.files || []))];
      if (files.some(file => !existsSync(file))) throw new Error(t("部分原文件已移动或删除"));
      await this.platform.writeFiles(files); this.lastHash = hash('files:' + files.join('\0'));
    } else if (selected.length === 1 && selected[0].kind === 'image') {
      const image = nativeImage.createFromPath(selected[0].imagePath || '');
      if (image.isEmpty()) throw new Error(t("图片附件不存在"));
      await clipboard.write([new ElectronClipboardItem({ 'image/png': new Blob([new Uint8Array(image.toPNG())], { type:'image/png' }) })]); this.lastHash = selected[0].hash;
    } else throw new Error(t("合并复制支持多条文本或多个文件；图片请单独选择"));
    this.lastSequence = this.platform.sequence();
    this.store.touchClips(ids);
    this.changed();
  }
}
