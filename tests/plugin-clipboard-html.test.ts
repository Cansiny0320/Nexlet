import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { SdkContext } from '../src/main/plugin-sdk/context';
import type { Platform } from '../src/main/platform';
import { PluginTasks } from '../src/main/plugin-sdk/tasks';

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('electron', () => ({
  app: {},
  nativeTheme: {},
  shell: {},
  dialog: {},
  Notification: class {},
  clipboard: { read },
  ClipboardItem: class {},
  nativeImage: {},
}));
import { PluginSystem } from '../src/main/plugin-sdk/system';

describe('plugin clipboard HTML', () => {
  const system = new PluginSystem(new PluginTasks(), {} as Platform);
  const requirePermission = vi.fn();
  const context = { require: requirePermission } as unknown as SdkContext;
  beforeEach(() => {
    read.mockReset();
    requirePermission.mockReset();
  });

  it('requires permission before accessing clipboard contents', async () => {
    requirePermission.mockImplementation(() => {
      throw new Error('permission denied');
    });
    await expect(system.invoke(context, 'clipboard.readHTML', undefined)).rejects.toThrow(
      'permission denied',
    );
    expect(requirePermission).toHaveBeenCalledWith('clipboard.read');
    expect(read).not.toHaveBeenCalled();
  });

  it('returns null when no HTML representation exists', async () => {
    read.mockResolvedValue([{ types: ['text/plain'], getType: vi.fn() }]);
    await expect(system.invoke(context, 'clipboard.readHTML', undefined)).resolves.toBeNull();
  });

  it('preserves full HTML and Unicode without executing or sanitizing it', async () => {
    const html = '<style>.xl1{color:red}</style><table><tr><td>你好 🧪</td></tr></table>';
    const getType = vi.fn().mockResolvedValue(new Blob([html], { type: 'text/html' }));
    read.mockResolvedValue([{ types: ['text/html'], getType }]);
    await expect(system.invoke(context, 'clipboard.readHTML', undefined)).resolves.toBe(html);
    expect(getType).toHaveBeenCalledWith('text/html');
  });

  it('rejects oversized HTML before decoding it, rather than returning broken markup', async () => {
    const blob = new Blob(['x'.repeat(2 * 1024 * 1024 + 1)], { type: 'text/html' });
    const decode = vi.spyOn(blob, 'text');
    read.mockResolvedValue([{ types: ['text/html'], getType: async () => blob }]);
    await expect(system.invoke(context, 'clipboard.readHTML', undefined)).rejects.toThrow(
      'exceeds 2 MiB',
    );
    expect(decode).not.toHaveBeenCalled();
  });
});
