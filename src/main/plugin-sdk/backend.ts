import { t, currentLocale } from '../../shared/i18n';
import { utilityProcess, type UtilityProcess } from 'electron';
import { mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PluginRecord } from '../../shared/types';

interface Pending { resolve(value: unknown): void; reject(error: Error): void; progress(value: unknown): void; }
interface Worker { child: UtilityProcess; pending: Map<string, Pending>; }
export class PluginBackends {
  private workers = new Map<string, Promise<Worker>>();
  constructor(private directory: string) {}
  async call(record: PluginRecord, method: string, args: unknown, signal: AbortSignal, progress: (value: unknown) => void): Promise<unknown> {
    if (typeof method !== 'string' || !/^[\w.-]{1,100}$/.test(method)) throw new Error(t("后台方法无效"));
    const worker = await this.get(record); signal.throwIfAborted();
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      // Node backends can ignore AbortSignal. Kill their process to guarantee cancellation.
      const abort = () => { this.stop(record.manifest.id); reject(signal.reason); };
      const finish = () => signal.removeEventListener('abort', abort);
      worker.pending.set(id, { resolve: value => { finish(); resolve(value); }, reject: error => { finish(); reject(error); }, progress });
      signal.addEventListener('abort', abort, { once: true });
      worker.child.postMessage({ type: 'call', id, method, args, locale: currentLocale() });
    });
  }
  private get(record: PluginRecord): Promise<Worker> {
    const id = record.manifest.id;
    let pending = this.workers.get(id);
    if (!pending) {
      pending = this.start(record); this.workers.set(id, pending);
      void pending.catch(() => { if (this.workers.get(id) === pending) this.workers.delete(id); });
    }
    return pending;
  }
  private async start(record: PluginRecord): Promise<Worker> {
    if (!record.manifest.backend || !record.manifest.permissions.includes('backend')) throw new Error(t("插件未声明 backend"));
    const root = await realpath(record.directory), file = await realpath(path.join(root, record.manifest.backend));
    const relative = path.relative(root, file);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(t("后台入口越界"));
    const dataDirectory = path.join(this.directory, 'plugin-backends', record.manifest.id);
    await mkdir(dataDirectory, { recursive: true });
    const child = utilityProcess.fork(path.join(__dirname, 'plugin-backend-worker.cjs'), [file, dataDirectory, currentLocale()], { cwd: root, serviceName: `Nexlet plugin: ${record.manifest.id}`, stdio: 'ignore', env: { ...process.env, NODE_OPTIONS: '' } });
    const worker: Worker = { child, pending: new Map() };
    child.on('message', message => {
      const job = worker.pending.get(message?.id); if (!job) return;
      if (message.type === 'progress') { job.progress(message.value); return; }
      worker.pending.delete(message.id);
      if (message.type === 'result') job.resolve(message.value); else job.reject(new Error(message.error || t("后台调用失败")));
    });
    child.on('exit', () => {
      for (const job of worker.pending.values()) job.reject(new Error(t("插件后台进程已退出")));
      worker.pending.clear();
      const current = this.workers.get(record.manifest.id);
      void current?.then(value => { if (value === worker && this.workers.get(record.manifest.id) === current) this.workers.delete(record.manifest.id); });
    });
    return worker;
  }
  stop(id: string): void {
    const pending = this.workers.get(id); this.workers.delete(id);
    void pending?.then(worker => {
      for (const job of worker.pending.values()) job.reject(new Error(t("插件后台进程已停止")));
      worker.pending.clear(); worker.child.kill();
    }, () => {});
  }
  close(): void { for (const id of this.workers.keys()) this.stop(id); }
}
