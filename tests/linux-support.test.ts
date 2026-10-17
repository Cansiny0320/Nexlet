import { afterEach, expect, it, vi } from 'vite-plus/test';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanLinuxApplications } from '../src/main/linux-desktop';
import { LinuxFileSearch, linuxFilenameMatcher } from '../src/main/linux-search';
import { LinuxStartup } from '../src/main/linux-startup';
import { decodeFileUris, encodeFileUris, LinuxPaste } from '../src/main/linux-platform';
const folders: string[] = [];
async function temp() {
  const f = await mkdtemp(path.join(tmpdir(), 'nexlet-linux-'));
  folders.push(f);
  return f;
}
afterEach(async () => {
  await Promise.all(folders.splice(0).map((f) => rm(f, { recursive: true, force: true })));
});
it('XDG 用户项覆盖系统项，隐藏项不复活，本地化名称和桌面条件生效', async () => {
  const f = await temp(),
    user = path.join(f, 'user'),
    system = path.join(f, 'system');
  await mkdir(user);
  await mkdir(system);
  const entry = (name: string, extra = '') =>
    `[Desktop Entry]\nType=Application\nName=${name}\nExec=example %U\n${extra}`;
  await writeFile(path.join(system, 'hidden.desktop'), entry('系统项'));
  await writeFile(path.join(user, 'hidden.desktop'), '[Desktop Entry]\nHidden=true\n');
  await writeFile(path.join(system, 'app.desktop'), entry('Old'));
  await writeFile(
    path.join(user, 'app.desktop'),
    entry('New', 'Name[zh_CN]=中文名称\nOnlyShowIn=GNOME;\n'),
  );
  await writeFile(path.join(user, 'other.desktop'), entry('Other', 'NotShowIn=GNOME;\n'));
  await writeFile(
    path.join(user, 'missing.desktop'),
    entry('Missing', 'TryExec=/does/not/exist\n'),
  );
  const items = await scanLinuxApplications([user, system], {
    LANG: 'zh_CN.UTF-8',
    XDG_CURRENT_DESKTOP: 'ubuntu:GNOME',
  });
  expect(items.map((x) => x.name)).toEqual(['中文名称']);
  expect(items[0].path).toBe(path.join(user, 'app.desktop'));
});
it('文件 URI 正确处理空格中文和百分号，拒绝远程及非文件 URI', () => {
  const files = ['/tmp/a b.txt', '/tmp/中文%20.txt'];
  expect(decodeFileUris(encodeFileUris(files))).toEqual(files);
  expect(
    decodeFileUris(
      'copy\nfile:///tmp/a%20b\nhttps://example.com/a\nfile://remote/tmp/x\nfile:///tmp/%00x\n# comment',
    ),
  ).toEqual(['/tmp/a b']);
});
it('自启动只写用户目录，稳定路径转义并回读，关闭仅移除自己的项', async () => {
  const f = await temp(),
    manager = new LinuxStartup('/home/user/My $App%/Nexlet.AppImage', f);
  expect(manager.read().enabled).toBe(false);
  expect(manager.set(true).enabled).toBe(true);
  const { readFile } = await import('node:fs/promises');
  const file = path.join(f, 'autostart/app.nexlet.desktop.desktop');
  expect(await readFile(file, 'utf8')).toContain('--autostart');
  expect(await readFile(file, 'utf8')).toContain('%%');
  expect(new LinuxStartup('/different/app', f).read().enabled).toBe(false);
  expect(manager.set(false).enabled).toBe(false);
});
it('文件搜索限定指定目录，支持多词/扩展名，跳过隐藏目录与符号链接', async () => {
  const f = await temp(),
    root = path.join(f, 'scope');
  await mkdir(root);
  await mkdir(path.join(root, '.hidden'));
  await writeFile(path.join(root, '项目 报告.PDF'), 'ok');
  await writeFile(path.join(root, '.hidden', '项目.pdf'), 'hidden');
  await writeFile(path.join(f, 'outside.pdf'), 'out');
  await symlink(f, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const search = new LinuxFileSearch(() => [root]);
  const result = await search.search(1, '项目 ext:pdf');
  expect(result.status).toBe('ready');
  expect(result.items.map((x) => x.name)).toEqual(['项目 报告.PDF']);
  expect((await new LinuxFileSearch(() => []).search(1, 'x')).message).toContain('添加');
});
it('文件搜索最多返回 200 条，新请求取消旧请求', async () => {
  const f = await temp();
  await Promise.all(
    Array.from({ length: 205 }, (_, i) => writeFile(path.join(f, `match-${i}`), '')),
  );
  const search = new LinuxFileSearch(() => [f]);
  expect(await search.search(1, 'match')).toMatchObject({
    limited: true,
    items: expect.any(Array),
  });
  expect((await search.search(1, 'match')).items).toHaveLength(200);
  const old = search.search(1, 'match');
  await search.search(1, '');
  expect((await old).status).toBe('idle');
});
it('X11 回贴校验目标窗口，Wayland 不执行注入', async () => {
  const run = vi.fn().mockResolvedValue({ stdout: '12' }),
    paste = new LinuxPaste(run, { DISPLAY: ':1' });
  expect(await paste.remember()).toEqual({ handle: '12', pid: 12 });
  run.mockImplementation(async (_cmd: string, args: string[]) => ({
    stdout: args[0] === 'getwindowpid' ? '99' : '12',
  }));
  await expect(paste.paste({ handle: '12', pid: 12 })).rejects.toThrow('变化');
  expect(run.mock.calls.some((c) => c[1][0] === 'key')).toBe(false);
  run.mockClear();
  const wayland = new LinuxPaste(run, { XDG_SESSION_TYPE: 'wayland' });
  expect(await wayland.remember()).toBeNull();
  await expect(wayland.paste({ handle: '12', pid: 12 })).rejects.toThrow('手动');
  expect(run).not.toHaveBeenCalled();
});
it('X11 恢复焦点并再次核对 PID 后才发出粘贴', async () => {
  const run = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => ({
    stdout: args[0] === 'getwindowpid' ? '42' : '12',
  }));
  await new LinuxPaste(run, { DISPLAY: ':1' }).paste({ handle: '12', pid: 42 });
  expect(run.mock.calls.map((c) => c[1])).toEqual([
    ['getwindowpid', '12'],
    ['windowactivate', '--sync', '12'],
    ['getactivewindow'],
    ['getwindowpid', '12'],
    ['key', '--clearmodifiers', 'ctrl+v'],
  ]);
});

it('通配符将正则符号按字面匹配，重复星号不会导致指数回溯', () => {
  expect(linuxFilenameMatcher('报告?.PDF')('报告甲.pdf')).toBe(true);
  expect(linuxFilenameMatcher('[草稿]')('[草稿].txt')).toBe(true);
  expect(linuxFilenameMatcher('[草稿]')('草.txt')).toBe(false);
  expect(linuxFilenameMatcher('*a'.repeat(100) + 'b')('a'.repeat(250))).toBe(false);
});
