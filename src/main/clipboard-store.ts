import { Worker } from 'node:worker_threads';
import path from 'node:path';
import type { Store } from './store';
import type { Settings } from '../shared/types';
import { currentLocale, type Locale } from '../shared/i18n';

export type ClipboardMethod =
  | 'addClip'
  | 'clipIndex'
  | 'clipPage'
  | 'clips'
  | 'clip'
  | 'touchClips'
  | 'hasClipHash'
  | 'favorite'
  | 'deleteClips'
  | 'clearClips'
  | 'prune'
  | 'clipRange'
  | 'clearClipRange'
  | 'setClipOcr';
export interface ClipboardRequest {
  id: number;
  method: ClipboardMethod | 'close';
  args: unknown[];
  locale: Locale;
  query?: { version: number; signal: SharedArrayBuffer };
}
export interface ClipboardResponse {
  id: number;
  value?: unknown;
  error?: string;
}
export type ClipboardStorage = { images: string; settings(): Settings } & {
  [K in ClipboardMethod]: (
    ...args: Parameters<Store[K]>
  ) => ReturnType<Store[K]> | Promise<ReturnType<Store[K]>>;
};

/** Only clipboard data crosses this boundary. Documents remain in the main-process Store. */
export class ClipboardStore {
  readonly images: string;
  private worker: Worker | null = null;
  private sequence = 0;
  private closed = false;
  private pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  private queries = new Map<number, Int32Array<SharedArrayBuffer>>();
  constructor(
    private directory: string,
    readonly settings: () => Settings,
  ) {
    this.images = path.join(directory, 'images');
    this.connect();
  }
  private connect(): Worker {
    if (this.closed) throw Error('Clipboard store closed');
    if (this.worker) return this.worker;
    const worker = new Worker(path.join(__dirname, 'clipboard-store-worker.cjs'), {
      workerData: { directory: this.directory },
    });
    this.worker = worker;
    worker.on('message', (message: ClipboardResponse) => {
      if (this.worker !== worker) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(Error(message.error));
      else request.resolve(message.value);
    });
    const failed = (error: Error) => {
      if (this.worker !== worker) return;
      this.worker = null;
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
      void worker.terminate();
    };
    worker.once('error', failed);
    worker.once('exit', (code) => failed(Error(`Clipboard worker exited (${code})`)));
    return worker;
  }
  private send(
    method: ClipboardRequest['method'],
    args: unknown[],
    query?: ClipboardRequest['query'],
  ): Promise<unknown> {
    const worker = this.connect(),
      id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({
        id,
        method,
        args,
        query,
        locale: currentLocale(),
      } satisfies ClipboardRequest);
    });
  }
  private call<K extends ClipboardMethod>(
    method: K,
    ...args: Parameters<Store[K]>
  ): Promise<ReturnType<Store[K]>> {
    return this.send(method, args) as Promise<ReturnType<Store[K]>>;
  }
  addClip(...args: Parameters<Store['addClip']>) {
    return this.call('addClip', ...args);
  }
  clipIndex(query = '', kind = 'all', board?: string[], owner?: number) {
    if (owner === undefined) return this.call('clipIndex', query, kind, board);
    let signal = this.queries.get(owner);
    if (!signal) this.queries.set(owner, (signal = new Int32Array(new SharedArrayBuffer(4))));
    const version = Atomics.add(signal, 0, 1) + 1;
    return this.send('clipIndex', [query, kind, board], {
      signal: signal.buffer,
      version,
    }) as Promise<ReturnType<Store['clipIndex']>>;
  }
  forget(owner: number) {
    const signal = this.queries.get(owner);
    if (signal) Atomics.add(signal, 0, 1);
    this.queries.delete(owner);
  }
  clipPage(...args: Parameters<Store['clipPage']>) {
    return this.call('clipPage', ...args);
  }
  clips(...args: Parameters<Store['clips']>) {
    return this.call('clips', ...args);
  }
  clip(...args: Parameters<Store['clip']>) {
    return this.call('clip', ...args);
  }
  touchClips(...args: Parameters<Store['touchClips']>) {
    return this.call('touchClips', ...args);
  }
  hasClipHash(...args: Parameters<Store['hasClipHash']>) {
    return this.call('hasClipHash', ...args);
  }
  favorite(...args: Parameters<Store['favorite']>) {
    return this.call('favorite', ...args);
  }
  deleteClips(...args: Parameters<Store['deleteClips']>) {
    return this.call('deleteClips', ...args);
  }
  clearClips(...args: Parameters<Store['clearClips']>) {
    return this.call('clearClips', ...args);
  }
  clipRange(...args: Parameters<Store['clipRange']>) {
    return this.call('clipRange', ...args);
  }
  clearClipRange(...args: Parameters<Store['clearClipRange']>) {
    return this.call('clearClipRange', ...args);
  }
  setClipOcr(...args: Parameters<Store['setClipOcr']>) {
    return this.call('setClipOcr', ...args);
  }
  prune(...args: Parameters<Store['prune']>) {
    return this.call('prune', ...args);
  }
  async close() {
    if (this.closed) return;
    const worker = this.worker;
    const closing = worker ? this.send('close', []) : Promise.resolve();
    this.closed = true;
    for (const owner of this.queries.keys()) this.forget(owner);
    try {
      await closing;
    } finally {
      if (worker) await worker.terminate();
    }
  }
}
