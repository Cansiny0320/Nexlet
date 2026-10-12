import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
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
