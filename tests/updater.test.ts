import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppUpdates, portableRelease } from '../src/main/updater';

function fixture(mode: 'automatic'|'portable'|'unsupported' = 'automatic') {
  const transport = Object.assign(new EventEmitter(), {
    checkForUpdates: vi.fn(async () => { transport.emit('update-available', { version: '0.2.3', releaseNotes: '修复回贴' }); }),
    downloadUpdate: vi.fn(async () => { transport.emit('download-progress', { percent: 50 }); transport.emit('update-downloaded', { version: '0.2.3' }); }),
    quitAndInstall: vi.fn()
  });
  const prepare = vi.fn(async () => {}), changed = vi.fn();
  const updates = new AppUpdates('0.2.2', mode, transport, changed, prepare);
  return { updates, transport, prepare, changed };
}

describe('主程序更新', () => {
  it('收到进度前不显示虚假的 0%，保留下载大小和速度直到校验完成', async () => {
    const { updates, transport } = fixture();
    let finish!: () => void;
    transport.downloadUpdate.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    await updates.check();
    const pending = updates.download();
    expect(updates.read()).toMatchObject({ phase: 'downloading', percent: null });
    transport.emit('download-progress', { percent: 25, transferred: 250, total: 1000, bytesPerSecond: 50 });
    expect(updates.read()).toMatchObject({ percent: 25, transferred: 250, total: 1000, bytesPerSecond: 50 });
    transport.emit('download-progress', { percent: 100, transferred: 1000, total: 1000, bytesPerSecond: 0 });
    expect(updates.read().phase).toBe('downloading');
    await expect(updates.install()).rejects.toThrow('下载');
    transport.emit('update-downloaded', { version: '0.2.3' });
    finish(); await pending;
    expect(updates.read().phase).toBe('downloaded');
  });

  it('检查不会下载；下载完成后才允许重启安装，先完成退出准备', async () => {
    const { updates, transport, prepare } = fixture();
    await expect(updates.install()).rejects.toThrow('下载');
    await updates.check();
    expect(updates.read()).toMatchObject({ phase: 'available', version: '0.2.3', notes: '修复回贴' });
    expect(transport.downloadUpdate).not.toHaveBeenCalled();
    await updates.download();
    expect(updates.read()).toMatchObject({ phase: 'downloaded', percent: 100 });
    await updates.install();
    expect(prepare).toHaveBeenCalledOnce();
    expect(transport.quitAndInstall).toHaveBeenCalledWith(false, true);
    expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(transport.quitAndInstall.mock.invocationCallOrder[0]);
  });

  it.each(['0.2.1', '0.2.2', '0.3.0-beta.1', 'invalid'])('不会下载降级、相同或非正式版本 %s', async version => {
    const { updates, transport } = fixture();
    transport.checkForUpdates.mockImplementation(async () => { transport.emit('update-available', { version }); });
    await updates.check();
    expect(updates.read().phase).toBe('latest');
    await expect(updates.download()).rejects.toThrow();
    expect(transport.downloadUpdate).not.toHaveBeenCalled();
  });

  it('网络/校验失败保留可重试状态，不会安装', async () => {
    const { updates, transport } = fixture();
    transport.checkForUpdates.mockRejectedValueOnce(new Error('net::ERR_INTERNET_DISCONNECTED'));
    await updates.check();
    expect(updates.read()).toMatchObject({ phase: 'error', error: expect.stringContaining('网络') });
    await updates.check();
    transport.downloadUpdate.mockImplementation(async () => { throw new Error('ERR_UPDATER_INVALID_SIGNATURE'); });
    await updates.download();
    expect(updates.read()).toMatchObject({ phase: 'error', error: expect.stringContaining('校验') });
    await expect(updates.install()).rejects.toThrow();
    expect(transport.quitAndInstall).not.toHaveBeenCalled();
  });

  it('进行中的检查去重，开发模式不联网、不安装', async () => {
    const { updates, transport } = fixture();
    let finish!: () => void;
    transport.checkForUpdates.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const pending = updates.check(); await updates.check();
    expect(transport.checkForUpdates).toHaveBeenCalledOnce(); finish(); await pending;
    const dev = fixture('unsupported'); await dev.updates.check();
    expect(dev.transport.checkForUpdates).not.toHaveBeenCalled();
    await expect(dev.updates.download()).rejects.toThrow();
  });

  it('便携版只接受正式版本的既定资产，下载链接不能来自任意地址', () => {
    const release = { tag_name: 'v0.2.3', draft: false, prerelease: false, body: '说明', assets: [{ name: 'Nexlet-0.2.3-Windows-x64.exe', browser_download_url: 'https://evil.invalid/payload.exe' }] };
    expect(portableRelease(release, '0.2.2')).toMatchObject({ version: '0.2.3', url: 'https://github.com/Cansiny0320/Nexlet/releases/download/v0.2.3/Nexlet-0.2.3-Windows-x64.exe' });
    expect(portableRelease({ ...release, draft: true }, '0.2.2')).toBeNull();
    expect(portableRelease({ ...release, assets: [] }, '0.2.2')).toBeNull();
    expect(portableRelease(release, '0.2.4')).toBeNull();
  });
});

describe('自动检查更新', () => {
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
  const delay = 30_000, interval = 6 * 60 * 60 * 1000;

  it('启动延迟检查，之后每 6 小时检查，重复启用不会产生多个定时器', async () => {
    vi.useFakeTimers();
    const { updates, transport } = fixture();
    transport.checkForUpdates.mockImplementation(async () => { transport.emit('update-not-available'); });
    updates.setAutomaticChecks(true);
    updates.setAutomaticChecks(true);
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(transport.checkForUpdates).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(transport.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updates.read().phase).toBe('latest');
    await vi.advanceTimersByTimeAsync(interval);
    expect(transport.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(transport.downloadUpdate).not.toHaveBeenCalled();
    expect(transport.quitAndInstall).not.toHaveBeenCalled();
  });

  it('后台失败静默恢复原状态，下个周期仍能发现更新', async () => {
    vi.useFakeTimers();
    const { updates, transport, changed } = fixture();
    const phases: string[] = [];
    changed.mockImplementation(() => { phases.push(updates.read().phase); });
    transport.checkForUpdates.mockImplementationOnce(async () => {
      const error = Error('net::ERR_INTERNET_DISCONNECTED');
      transport.emit('error', error);
      throw error;
    });
    updates.setAutomaticChecks(true);
    await vi.advanceTimersByTimeAsync(delay);
    expect(updates.read()).toMatchObject({ phase: 'idle', error: null });
    expect(phases).not.toContain('error');
    await vi.advanceTimersByTimeAsync(interval);
    expect(updates.read()).toMatchObject({ phase: 'available', version: '0.2.3' });
    expect(transport.downloadUpdate).not.toHaveBeenCalled();
  });

  it('已有新版本、下载中、待安装与安装中不会被定时检查覆盖', async () => {
    vi.useFakeTimers();
    const { updates, transport } = fixture();
    updates.setAutomaticChecks(true);
    await vi.advanceTimersByTimeAsync(delay);
    await vi.advanceTimersByTimeAsync(interval);
    expect(updates.read().phase).toBe('available');
    expect(transport.checkForUpdates).toHaveBeenCalledTimes(1);
    let finish!: () => void;
    transport.downloadUpdate.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const pending = updates.download();
    await vi.advanceTimersByTimeAsync(interval);
    expect(updates.read().phase).toBe('downloading');
    transport.emit('update-downloaded', { version: '0.2.3' });
    finish(); await pending;
    await vi.advanceTimersByTimeAsync(interval);
    expect(updates.read().phase).toBe('downloaded');
    await updates.install();
    await vi.advanceTimersByTimeAsync(interval);
    expect(updates.read().phase).toBe('installing');
    expect(transport.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('关闭或退出取消后续检查，手动检查仍可使用，重新启用可恢复', async () => {
    vi.useFakeTimers();
    const { updates, transport } = fixture();
    transport.checkForUpdates.mockImplementation(async () => { transport.emit('update-not-available'); });
    updates.setAutomaticChecks(true);
    updates.setAutomaticChecks(false);
    await vi.advanceTimersByTimeAsync(interval);
    expect(transport.checkForUpdates).not.toHaveBeenCalled();
    await updates.check();
    expect(transport.checkForUpdates).toHaveBeenCalledTimes(1);
    updates.setAutomaticChecks(true);
    await vi.advanceTimersByTimeAsync(delay);
    expect(transport.checkForUpdates).toHaveBeenCalledTimes(2);
    updates.setAutomaticChecks(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('检查请求仍在进行时，手动检查不会重入，关闭后不会重新安排检查', async () => {
    vi.useFakeTimers();
    const { updates, transport } = fixture();
    let finish!: () => void;
    transport.checkForUpdates.mockImplementation(() => new Promise<void>(resolve => {
      finish = resolve;
      transport.emit('update-not-available');
    }));
    updates.setAutomaticChecks(true);
    await vi.advanceTimersByTimeAsync(delay);
    await updates.check();
    expect(transport.checkForUpdates).toHaveBeenCalledTimes(1);
    updates.setAutomaticChecks(false);
    finish();
    await vi.advanceTimersByTimeAsync(interval);
    expect(transport.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('开发模式不启动检查，Windows 便携版通过现有来源检查', async () => {
    vi.useFakeTimers();
    const dev = fixture('unsupported');
    dev.updates.setAutomaticChecks(true);
    expect(vi.getTimerCount()).toBe(0);
    const checkPortable = vi.fn(async () => ({ version: '0.2.3', notes: '更新说明', url: 'https://github.com/Cansiny0320/Nexlet/releases' }));
    const portable = new AppUpdates('0.2.2', 'portable', null, () => {}, async () => {}, checkPortable);
    portable.setAutomaticChecks(true);
    await vi.advanceTimersByTimeAsync(delay);
    expect(checkPortable).toHaveBeenCalledOnce();
    expect(portable.read()).toMatchObject({ phase: 'available', version: '0.2.3', mode: 'portable' });
    expect(dev.transport.checkForUpdates).not.toHaveBeenCalled();
  });
});

describe('安装前保存', () => {
  it('任一窗口保存失败时不得调用安装', async () => {
    const { updates, transport, prepare } = fixture();
    await updates.check(); await updates.download();
    prepare.mockRejectedValueOnce(Error('稿纸尚未保存'));
    await updates.install();
    expect(updates.read()).toMatchObject({ phase: 'error', error: expect.stringContaining('尚未保存') });
    expect(transport.quitAndInstall).not.toHaveBeenCalled();
  });
  it('只有本轮所有宿主窗口确认才能继续，伪造或过期确认无效', async () => {
    const { UpdateSaveBarrier } = await import('../src/main/updater');
    const barrier = new UpdateSaveBarrier(), sent = vi.fn(), finished = vi.fn();
    const pending = barrier.prepare([1, 2], sent).then(finished);
    const token = sent.mock.calls[0][1];
    barrier.ready(3, token, null); barrier.ready(1, 'old', null); barrier.ready(1, token, null);
    await Promise.resolve(); expect(finished).not.toHaveBeenCalled();
    barrier.ready(2, token, null); await pending; expect(finished).toHaveBeenCalledOnce();
  });
  it('窗口保存报错或无响应时保留运行中的应用', async () => {
    const { UpdateSaveBarrier } = await import('../src/main/updater');
    const barrier = new UpdateSaveBarrier();
    await expect(barrier.prepare([1], (id, token) => barrier.ready(id, token, '保存失败'))).rejects.toThrow('保存失败');
    await expect(barrier.prepare([1], () => {}, 5)).rejects.toThrow('超时');
  });
});

it('便携模式只提供正式 EXE 链接，不调用下载或安装器', async () => {
  const release = { version: '0.2.3', notes: '更新说明', url: 'https://github.com/Cansiny0320/Nexlet/releases/download/v0.2.3/Nexlet-0.2.3-Windows-x64.exe' };
  const updates = new AppUpdates('0.2.2', 'portable', null, () => {}, async () => {}, async () => release);
  await updates.check();
  expect(updates.read()).toMatchObject({ mode: 'portable', phase: 'available', version: '0.2.3' });
  expect(updates.downloadUrl()).toBe(release.url);
  await expect(updates.download()).rejects.toThrow();
  await expect(updates.install()).rejects.toThrow();
});
