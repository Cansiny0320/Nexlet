import { randomUUID } from 'node:crypto';
import semver from 'semver';
import type { UpdateStatus } from '../shared/types';

const repository = 'https://github.com/Cansiny0320/Nexlet';
interface ReleaseInfo { version: string; releaseNotes?: string | { note: string }[] | null; }
export interface UpdateTransport {
  on(event: string, listener: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(silent?: boolean, relaunch?: boolean): void;
}
const newer = (version: string, current: string) => !!semver.valid(version) && !semver.prerelease(version) && semver.gt(version, current);

export function portableRelease(value: unknown, current: string): { version: string; notes: string; url: string } | null {
  const data = value as { tag_name?: string; draft?: boolean; prerelease?: boolean; body?: string; assets?: { name: string }[] } | null;
  if (!data || data.draft !== false || data.prerelease !== false || typeof data.tag_name !== 'string') return null;
  const version = data.tag_name.replace(/^v/, '');
  if (!newer(version, current)) return null;
  const name = `Nexlet-${version}-Windows-x64.exe`;
  if (!Array.isArray(data.assets) || !data.assets.some(asset => asset.name === name)) return null;
  return { version, notes: typeof data.body === 'string' ? data.body.slice(0, 8000) : '', url: `${repository}/releases/download/${encodeURIComponent(data.tag_name)}/${name}` };
}

async function latestPortable(current: string) {
  const response = await fetch('https://api.github.com/repos/Cansiny0320/Nexlet/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20000)
  });
  if (response.status === 404) return null;
  if (!response.ok) throw Error(`检查更新失败（HTTP ${response.status}），请稍后重试`);
  return portableRelease(await response.json(), current);
}

function updateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/signature|sha512|checksum|code.?sign|digest/i.test(message)) return '更新包校验失败，未安装；请重试或从正式发布页下载';
  if (/net::|ENOTFOUND|ECONN|ETIMEDOUT|timeout|fetch failed|network/i.test(message)) return '网络连接失败，请检查网络后重试';
  if (/404|latest.*yml|No published versions/i.test(message)) return '当前发布尚未提供可用更新，请稍后重试';
  return `更新失败：${message.slice(0, 500)}`;
}

export class AppUpdates {
  private status: UpdateStatus;
  private portableUrl: string | null = null;
  constructor(
    private readonly current: string,
    mode: UpdateStatus['mode'],
    private readonly transport: UpdateTransport | null,
    private readonly changed: () => void,
    private readonly prepareInstall: () => Promise<void>,
    private readonly checkPortable = latestPortable
  ) {
    this.status = { mode, phase: 'idle', version: null, notes: '', percent: null, error: null };
    transport?.on('update-available', (info: ReleaseInfo) => {
      if (this.status.phase !== 'checking') return;
      if (!newer(info.version, current)) { this.set({ phase: 'latest' }); return; }
      const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : info.releaseNotes?.map(item => item.note).join('\n') || '';
      this.set({ phase: 'available', version: info.version, notes: notes.slice(0, 8000) });
    });
    transport?.on('update-not-available', () => { if (this.status.phase === 'checking') this.set({ phase: 'latest' }); });
    transport?.on('download-progress', ({ percent, transferred, total, bytesPerSecond }: { percent: number; transferred?: number; total?: number; bytesPerSecond?: number }) => {
      const valid = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
      if (this.status.phase === 'downloading') this.set({
        percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.floor(percent))) : null,
        transferred: valid(transferred), total: valid(total), bytesPerSecond: valid(bytesPerSecond)
      });
    });
    transport?.on('update-downloaded', (info: ReleaseInfo) => {
      if (this.status.phase === 'downloading' && info.version === this.status.version) this.set({ phase: 'downloaded', percent: 100 });
    });
    transport?.on('error', (error: Error) => {
      if (['checking', 'downloading', 'installing'].includes(this.status.phase)) this.fail(error);
    });
  }
  read(): UpdateStatus { return { ...this.status }; }
  private set(patch: Partial<UpdateStatus>) { this.status = { ...this.status, ...patch }; this.changed(); }
  private fail(error: unknown) { this.set({ phase: 'error', error: updateError(error), percent: null }); }
  async check(): Promise<void> {
    if (this.status.mode === 'unsupported' || ['checking', 'downloading', 'downloaded', 'installing'].includes(this.status.phase)) return;
    this.portableUrl = null;
    this.set({ phase: 'checking', version: null, notes: '', percent: null, transferred: null, total: null, bytesPerSecond: null, error: null });
    try {
      if (this.status.mode === 'portable') {
        const info = await this.checkPortable(this.current);
        this.portableUrl = info?.url || null;
        this.set(info ? { phase: 'available', version: info.version, notes: info.notes } : { phase: 'latest' });
      } else {
        await this.transport!.checkForUpdates();
        if (this.status.phase === 'checking') this.set({ phase: 'latest' });
      }
    } catch (error) { this.fail(error); }
  }
  async download(): Promise<void> {
    if (this.status.mode !== 'automatic' || this.status.phase !== 'available') throw Error('请先检查可用更新');
    this.set({ phase: 'downloading', percent: null, transferred: null, total: null, bytesPerSecond: null, error: null });
    try { await this.transport!.downloadUpdate(); } catch (error) { this.fail(error); }
  }
  async install(): Promise<void> {
    if (this.status.mode !== 'automatic' || this.status.phase !== 'downloaded') throw Error('更新尚未下载完成');
    this.set({ phase: 'installing' });
    try { await this.prepareInstall(); this.transport!.quitAndInstall(false, true); } catch (error) { this.fail(error); }
  }
  downloadUrl(): string {
    if (this.status.mode !== 'portable' || this.status.phase !== 'available' || !this.portableUrl) throw Error('请先检查便携版更新');
    return this.portableUrl;
  }
}


export class UpdateSaveBarrier {
  private pending: { token: string; windows: Set<number>; resolve: () => void; reject: (error: Error) => void } | null = null;
  async prepare(windows: number[], send: (id: number, token: string) => void, timeout = 10000): Promise<void> {
    if (!windows.length) return;
    const token = randomUUID();
    let timer: ReturnType<typeof setTimeout>;
    try {
      await new Promise<void>((resolve, reject) => {
        this.pending = { token, windows: new Set(windows), resolve, reject };
        timer = setTimeout(() => reject(Error('等待窗口保存超时，请确认所有稿纸已保存后重试')), timeout);
        for (const id of windows) send(id, token);
      });
    } finally { clearTimeout(timer!); this.pending = null; }
  }
  ready(id: number, token: unknown, error: unknown): void {
    const pending = this.pending;
    if (!pending || pending.token !== token || !pending.windows.has(id)) return;
    if (typeof error === 'string' && error) { pending.reject(Error(error.slice(0, 500))); return; }
    pending.windows.delete(id);
    if (!pending.windows.size) pending.resolve();
  }
}
