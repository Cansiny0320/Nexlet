import { t } from '../../shared/i18n';
import type { Schedule } from '../../shared/plugin-api';
interface Storage { get<T>(key: string, fallback: T): T; set(key: string, value: unknown): void; }
export class PluginScheduler {
  private running = new Map<string, AbortController>();
  private timer: ReturnType<typeof setInterval>;
  constructor(private store: Storage, private enabled: (id: string) => boolean, private execute: (plugin: string, schedule: Schedule, signal: AbortSignal) => Promise<unknown>) {
    this.timer = setInterval(() => { void this.tick(); }, 1000); this.timer.unref();
  }
  list(plugin: string): Schedule[] { return this.store.get<Record<string, Schedule[]>>('plugin-schedules', {})[plugin] || []; }
  set(plugin: string, value: Schedule): true {
    if (!value || typeof value.id !== 'string' || !/^[\w.-]{1,100}$/.test(value.id) || typeof value.method !== 'string' || !/^[\w.-]{1,100}$/.test(value.method) || !Number.isFinite(value.at) || value.at < 0 || (value.intervalMs !== undefined && (!Number.isFinite(value.intervalMs) || value.intervalMs < 1000))) throw new Error(t("调度参数无效"));
    if (Buffer.byteLength(JSON.stringify(value.args ?? null)) > 256 * 1024) throw new Error(t("调度参数过大"));
    const values = this.list(plugin).filter(item => item.id !== value.id);
    if (values.length >= 100) throw new Error(t("调度超过 100 个"));
    values.push({ id: value.id, method: value.method, at: value.at, args: value.args, intervalMs: value.intervalMs }); this.save(plugin, values); return true;
  }
  remove(plugin: string, id: string): boolean {
    const values = this.list(plugin), filtered = values.filter(item => item.id !== id);
    this.running.get(`${plugin}:${id}`)?.abort(); this.save(plugin, filtered); return values.length !== filtered.length;
  }
  private save(plugin: string, values: Schedule[]): void {
    const all = this.store.get<Record<string, Schedule[]>>('plugin-schedules', {}); all[plugin] = values; this.store.set('plugin-schedules', all);
  }
  async tick(now = Date.now()): Promise<void> {
    const all = this.store.get<Record<string, Schedule[]>>('plugin-schedules', {});
    await Promise.all(Object.entries(all).flatMap(([plugin, schedules]) => !this.enabled(plugin) ? [] : schedules.map(async schedule => {
      const key = `${plugin}:${schedule.id}`;
      if (schedule.at > now || this.running.has(key)) return;
      const controller = new AbortController(); this.running.set(key, controller);
      // Persist the next deadline before dispatch: no duplicate catch-up loop after a crash.
      this.save(plugin, this.list(plugin).map(item => item.id === schedule.id ? { ...item, at: schedule.intervalMs ? now + schedule.intervalMs : Number.MAX_SAFE_INTEGER, lastRun: now, lastError: undefined } : item));
      const timer = setTimeout(() => controller.abort(new Error(t("调度超时"))), 300_000);
      try { await this.execute(plugin, schedule, controller.signal); }
      catch (error) { this.save(plugin, this.list(plugin).map(item => item.id === schedule.id ? { ...item, lastError: String((error as Error).message || error).slice(0, 1000) } : item)); }
      finally { clearTimeout(timer); this.running.delete(key); }
    })));
  }
  stop(plugin: string): void { for (const [key, job] of this.running) if (key.startsWith(`${plugin}:`)) job.abort(new Error(t("插件已停止"))); }
  clear(plugin: string): void { this.stop(plugin); this.save(plugin, []); }
  close(): void { clearInterval(this.timer); for (const job of this.running.values()) job.abort(new Error(t("宿主退出"))); }
}
