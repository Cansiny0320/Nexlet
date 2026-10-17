import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
const { read, write } = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('electron', () => ({
  systemPreferences: {},
  clipboard: { read, write },
  ClipboardItem: class {
    constructor(public values: Record<string, Blob>) {}
  },
}));
vi.mock('koffi', () => ({ default: {} }));
import { Platform } from '../src/main/platform';
import { osClipboardFormat } from '../src/main/linux-platform';
beforeEach(() => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
  read.mockReset();
  write.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());
it('写入两个 Linux 文件管理器格式，cut 历史重新复制保持 copy 语义', async () => {
  const p = new Platform(() => undefined);
  await p.writeFiles(['/tmp/中文 a%20']);
  const values = write.mock.calls[0][0][0].values;
  expect(await values[osClipboardFormat('x-special/gnome-copied-files')].text()).toMatch(
    /^copy\nfile:\/\/\/tmp\//,
  );
  expect(await values[osClipboardFormat('text/uri-list')].text()).toContain('%2520');
  const type = osClipboardFormat('x-special/gnome-copied-files');
  read.mockResolvedValue([
    { types: [type], getType: async () => new Blob(['cut\nfile:///tmp/space%20file']) },
  ]);
  expect(await p.readFiles()).toEqual(['/tmp/space file']);
});
it('识别原生 MIME 与 Electron OS 格式包装，忽略无效 URL', async () => {
  const p = new Platform(() => undefined);
  for (const type of ['text/uri-list', osClipboardFormat('text/uri-list')]) {
    read.mockResolvedValue([
      {
        types: [type],
        getType: async () => new Blob(['https://example.com\r\nfile:///tmp/a\r\n']),
      },
    ]);
    expect(await p.readFiles()).toEqual(['/tmp/a']);
  }
  read.mockResolvedValue([{ types: ['text/plain'] }]);
  expect(await p.readFiles()).toEqual([]);
});
