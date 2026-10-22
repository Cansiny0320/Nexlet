import type { ClipItem } from '../shared/types';
import type { OcrIndexTask } from '../shared/clipboard-ocr';
import { t } from '../shared/i18n';
interface Storage {
  clip(id: string): Promise<ClipItem | undefined>;
  setClipOcr(id: string, hash: string, text: string): Promise<boolean>;
}
export class ClipboardOcr {
  private tasks = new Map<string, OcrIndexTask>();
  private queue: ClipItem[] = [];
  private active: { id: string; controller: AbortController } | null = null;
  private pending: Promise<void> = Promise.resolve();
  private closed = false;
  constructor(
    private store: Storage,
    private recognize: (
      item: ClipItem,
      signal: AbortSignal,
      progress: (value: number) => void,
    ) => Promise<string>,
    private changed: () => void,
  ) {}
  read() {
    return [...this.tasks.values()].map((task) => ({ ...task }));
  }
  async enqueue(ids: string[], automatic = false) {
    if (this.closed) throw Error(t('OCR 队列已关闭'));
    const items = await Promise.all([...new Set(ids)].map((id) => this.store.clip(id)));
    if (this.closed) return;
    if (this.queue.length + items.length > 256) throw Error(t('OCR 队列最多 256 张图片'));
    for (const item of items) {
      if (
        !item ||
        item.kind !== 'image' ||
        !item.imagePath ||
        this.active?.id === item.id ||
        this.queue.some((value) => value.id === item.id) ||
        (automatic && item.ocrText)
      )
        continue;
      this.queue.push(item);
      this.tasks.set(item.id, { id: item.id, status: 'pending', progress: 0 });
    }
    for (const [id, task] of this.tasks)
      if (this.tasks.size > 300 && ['done', 'error', 'cancelled'].includes(task.status))
        this.tasks.delete(id);
    this.changed();
    this.start();
  }
  private start() {
    if (this.active || this.closed || !this.queue.length) return;
    const item = this.queue.shift()!,
      controller = new AbortController();
    this.active = { id: item.id, controller };
    const task = this.tasks.get(item.id)!;
    task.status = 'running';
    this.changed();
    const work = async () => {
      try {
        const text = await this.recognize(item, controller.signal, (value) => {
          if (!controller.signal.aborted) {
            task.progress = Math.max(0, Math.min(1, value));
            this.changed();
          }
        });
        if (controller.signal.aborted) return;
        if (await this.store.setClipOcr(item.id, item.hash, text)) {
          task.status = 'done';
          task.progress = 1;
        } else task.status = 'cancelled';
      } catch (error) {
        if (!controller.signal.aborted) {
          task.status = 'error';
          task.error = error instanceof Error ? error.message : String(error);
        }
      } finally {
        this.active = null;
        this.changed();
        this.start();
      }
    };
    this.pending = work();
  }
  cancel(ids?: string[]) {
    const selected = new Set(ids ?? [...this.tasks.keys()]);
    this.queue = this.queue.filter((item) => !selected.has(item.id));
    if (this.active && selected.has(this.active.id)) this.active.controller.abort();
    for (const id of selected) {
      const task = this.tasks.get(id);
      if (task && (task.status === 'pending' || task.status === 'running'))
        task.status = 'cancelled';
    }
    this.changed();
  }
  async clear(ids: string[]) {
    this.cancel(ids);
    for (const id of ids) {
      const item = await this.store.clip(id);
      if (item) await this.store.setClipOcr(id, item.hash, '');
      this.tasks.delete(id);
    }
    this.changed();
  }
  async idle() {
    while (this.active || this.queue.length) await this.pending;
  }
  close() {
    this.closed = true;
    this.cancel();
  }
}
