import { t } from '../../shared/i18n';
/** Every renderer owns its jobs. Cancellation wins even when an adapter ignores its signal. */
export class PluginTasks {
  private active = new Map<number, Map<string, AbortController>>();
  get size(): number { return [...this.active.values()].reduce((n, jobs) => n + jobs.size, 0); }
  async run<T>(owner: number, id: string, timeoutMs: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (typeof id !== 'string' || !/^[\w.-]{1,100}$/.test(id)) throw new Error(t("任务 ID 无效"));
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000) throw new Error(t("任务超时范围无效"));
    let jobs = this.active.get(owner);
    if (!jobs) { jobs = new Map(); this.active.set(owner, jobs); }
    if (jobs.has(id)) throw new Error(t("任务 ID 重复"));
    if (jobs.size >= 32) throw new Error(t("并行任务超过限制"));
    const controller = new AbortController(); jobs.set(id, controller);
    const timer = setTimeout(() => controller.abort(new Error(t("任务超时"))), timeoutMs);
    let onAbort!: () => void;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    try { return await Promise.race([aborted, work(controller.signal)]); }
    finally {
      clearTimeout(timer); controller.signal.removeEventListener('abort', onAbort);
      jobs.delete(id); if (!jobs.size) this.active.delete(owner);
    }
  }
  cancel(owner: number, id: unknown): boolean {
    const task = typeof id === 'string' ? this.active.get(owner)?.get(id) : undefined;
    if (!task) return false;
    task.abort(new Error(t("任务已取消"))); return true;
  }
  close(owner: number): void { for (const task of this.active.get(owner)?.values() || []) task.abort(new Error(t("任务已取消"))); }
  closeAll(): void { for (const owner of this.active.keys()) this.close(owner); }
}
