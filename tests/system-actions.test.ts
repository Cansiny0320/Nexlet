import { describe, expect, it, vi } from 'vitest';
import { SystemActions } from '../src/main/system-actions';

function fixture(platform: 'darwin' | 'win32' = 'darwin') {
  const execute = vi.fn().mockResolvedValue(undefined);
  const open = vi.fn().mockResolvedValue(undefined);
  const confirm = vi.fn().mockResolvedValue(true);
  const service = new SystemActions(platform, platform === 'darwin' ? '25.5' : '10.0.22631', { execute, open });
  return { service, execute, open, confirm };
}
describe('系统执行边界', () => {
  it.each(['darwin', 'win32'] as const)('%s 取消不执行，重试允许执行', async platform => {
    const f = fixture(platform); f.confirm.mockResolvedValueOnce(false);
    expect(await f.service.launch('system:action:sleep', f.confirm)).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(await f.service.launch('system:action:sleep', f.confirm)).toBe(true);
    expect(f.execute).toHaveBeenCalledWith('sleep');
  });
  it.each(['sleep', 'restart', 'shutdown', 'logout'])('%s 必须确认', async action => {
    const f = fixture(); await f.service.launch('system:action:' + action, f.confirm);
    expect(f.confirm).toHaveBeenCalledOnce();
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.confirm.mock.invocationCallOrder[0]).toBeLessThan(f.execute.mock.invocationCallOrder[0]);
  });
  it('固定 ID 解析目标，拒绝未知 ID、跨平台目标和命令行输入', async () => {
    const f = fixture();
    for (const id of ['system:action:sleep && shutdown', 'ms-settings:sound', 'system:settings:tabletmode', 'unknown']) {
      await expect(f.service.launch(id, f.confirm)).rejects.toThrow('不存在');
    }
    expect(f.execute).not.toHaveBeenCalled(); expect(f.open).not.toHaveBeenCalled();
    await f.service.launch('system:settings:sound', f.confirm);
    expect(f.open).toHaveBeenCalledWith('x-apple.systempreferences:com.apple.Sound-Settings.extension');
    expect(f.confirm).not.toHaveBeenCalled();
    expect(f.service.commands().every(c => !('url' in c) && !('action' in c))).toBe(true);
  });
  it('平台调用失败向上传播，后续仍可重试', async () => {
    const f = fixture(); f.execute.mockRejectedValueOnce(new Error('系统拒绝访问'));
    await expect(f.service.launch('system:action:sleep', f.confirm)).rejects.toThrow('系统拒绝访问');
    expect(await f.service.launch('system:action:sleep', f.confirm)).toBe(true);
  });
  it('确认期间拒绝重复触发', async () => {
    const f = fixture(); let resolve!: (value: boolean) => void;
    f.confirm.mockImplementationOnce(() => new Promise<boolean>(r => { resolve = r; }));
    const first = f.service.launch('system:action:restart', f.confirm);
    await expect(f.service.launch('system:action:restart', f.confirm)).rejects.toThrow('正在处理');
    resolve(true); await first;
    expect(f.execute).toHaveBeenCalledOnce();
  });
});
