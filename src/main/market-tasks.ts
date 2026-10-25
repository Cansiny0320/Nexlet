import { t } from '../shared/i18n';
import { randomUUID } from 'node:crypto';
import type { MarketTask } from '../shared/marketplace';
import type { PluginPermission } from '../shared/types';
import type { PluginBundle } from './plugin-bundle';
interface Job {
  value: MarketTask;
  controller?: AbortController;
  bundle?: PluginBundle;
}
export class MarketTasks {
  private jobs = new Map<string, Job>();
  private downloading = false;
  private installing = false;
  constructor(
    private download: (
      id: string,
      signal: AbortSignal,
      progress: (received: number, total?: number) => void,
    ) => Promise<PluginBundle>,
    private apply: (bundle: PluginBundle) => Promise<boolean>,
    private permissions: (id: string) => PluginPermission[],
    private changed: () => void,
  ) {}
  list(): MarketTask[] {
    return [...this.jobs.values()].map((job) => structuredClone(job.value)).reverse();
  }
  enqueue(pluginId: string): MarketTask {
    if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(pluginId))
      throw new Error(t('插件 ID 无效'));
    const existing = [...this.jobs.values()].find(
      (job) =>
        job.value.pluginId === pluginId &&
        !['done', 'failed', 'cancelled'].includes(job.value.state),
    );
    if (existing) return structuredClone(existing.value);
    if (
      [...this.jobs.values()].filter(
        (job) => !['done', 'failed', 'cancelled'].includes(job.value.state),
      ).length >= 3
    )
      throw new Error(t('请先完成或取消当前安装任务（最多 3 个）'));
    for (const [id, job] of this.jobs)
      if (this.jobs.size >= 30 && ['done', 'failed', 'cancelled'].includes(job.value.state))
        this.jobs.delete(id);
    const value: MarketTask = {
      id: randomUUID(),
      pluginId,
      name: pluginId,
      state: 'queued',
      received: 0,
    };
    this.jobs.set(value.id, { value });
    this.changed();
    void this.pump();
    return structuredClone(value);
  }
  cancel(id: string): void {
    const job = this.get(id);
    if (job.value.state === 'installing') throw new Error(t('安装正在提交，无法取消'));
    if (['done', 'cancelled', 'failed'].includes(job.value.state)) return;
    job.controller?.abort();
    job.bundle = undefined;
    job.value.state = 'cancelled';
    this.changed();
  }
  retry(id: string): void {
    const job = this.get(id);
    if (!['failed', 'cancelled'].includes(job.value.state)) throw new Error(t('此任务无需重试'));
    if (
      [...this.jobs.values()].filter(
        (j) => !['done', 'failed', 'cancelled'].includes(j.value.state),
      ).length >= 3
    )
      throw new Error(t('当前安装任务过多'));
    job.value = {
      id,
      pluginId: job.value.pluginId,
      name: job.value.name,
      state: 'queued',
      received: 0,
    };
    this.changed();
    void this.pump();
  }
  async install(id: string): Promise<boolean> {
    const job = this.get(id);
    if (job.value.state !== 'ready' || !job.bundle) throw new Error(t('安装包尚未准备完成'));
    if (this.installing) throw new Error(t('请等待当前安装完成'));
    this.installing = true;
    job.value.state = 'installing';
    this.changed();
    try {
      const result = await this.apply(job.bundle);
      job.value.state = result ? 'done' : 'cancelled';
      return result;
    } catch (error) {
      job.value.state = 'failed';
      job.value.error = error instanceof Error ? error.message : t('安装失败');
      throw error;
    } finally {
      job.bundle = undefined;
      this.installing = false;
      this.changed();
    }
  }
  private get(id: string) {
    const job = this.jobs.get(id);
    if (!job) throw new Error(t('安装任务不存在'));
    return job;
  }
  private async pump() {
    if (this.downloading) return;
    this.downloading = true;
    try {
      for (;;) {
        const job = [...this.jobs.values()].find((j) => j.value.state === 'queued');
        if (!job) break;
        const controller = new AbortController();
        job.controller = controller;
        job.value.state = 'downloading';
        this.changed();
        try {
          const bundle = await this.download(
            job.value.pluginId,
            controller.signal,
            (received, total) => {
              if (controller.signal.aborted) return;
              job.value.received = received;
              job.value.total = total;
              this.changed();
            },
          );
          if (controller.signal.aborted) continue;
          if (bundle.manifest.id !== job.value.pluginId)
            throw new Error(t('插件包身份与任务不一致'));
          job.bundle = bundle;
          job.value.state = 'ready';
          job.value.name = bundle.manifest.name;
          job.value.version = bundle.manifest.version;
          job.value.permissions = [...bundle.manifest.permissions];
          job.value.addedPermissions = bundle.manifest.permissions.filter(
            (p) => !this.permissions(job.value.pluginId).includes(p),
          );
        } catch (error) {
          if (!controller.signal.aborted) {
            job.value.state = 'failed';
            job.value.error = error instanceof Error ? error.message : t('下载失败');
          }
        } finally {
          if (job.controller === controller) job.controller = undefined;
          this.changed();
        }
      }
    } finally {
      this.downloading = false;
    }
  }
  close() {
    for (const job of this.jobs.values()) {
      job.controller?.abort();
      job.bundle = undefined;
    }
    this.jobs.clear();
  }
}
