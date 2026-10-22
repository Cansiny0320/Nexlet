import { describe, expect, it } from 'vite-plus/test';
import { renderSnippet, snippetVariables, validateProductivity } from '../src/shared/productivity';
import { WorkspaceRunner } from '../src/main/workspaces';
import { workspaceInvocation } from '../src/main/workspace-executor';
import { Productivity } from '../src/main/productivity';

describe('快捷短语', () => {
  it('日期、Unicode、手填和剪贴板变量只展开一次，支持转义', () => {
    const body = '{{input:姓名}}，{{date:YYYY-MM-DD HH:mm}}\n{{clipboard}}\\{{input:原样}}';
    expect(snippetVariables(body)).toEqual(['姓名']);
    expect(
      renderSnippet(body, { 姓名: '小陈' }, '{{input:不应展开}}', new Date(2026, 9, 22, 8, 9)),
    ).toBe('小陈，2026-10-22 08:09\n{{input:不应展开}}{{input:原样}}');
  });
  it('不默默吞掉缺少参数与未知变量', () => {
    expect(() => renderSnippet('{{input:姓名}}', {}, '', new Date())).toThrow('姓名');
    expect(() => snippetVariables('{{secret}}')).toThrow();
    expect(() => snippetVariables('{{input:}}')).toThrow();
  });
});
describe('工作区', () => {
  const workspace = {
    id: 'work',
    name: '工作',
    items: [
      { id: 'a', kind: 'folder' as const, target: '/tmp/a b' },
      {
        id: 'b',
        kind: 'editor' as const,
        target: '/tmp/a b',
        program: '/usr/bin/editor',
        args: ['/tmp/a;echo bad'],
      },
      { id: 'c', kind: 'url' as const, target: 'https://example.com' },
    ],
  };
  it('按顺序执行，单项失败继续，重试只执行失败项', async () => {
    const calls: string[] = [];
    let fail = true;
    const runner = new WorkspaceRunner(async (item) => {
      calls.push(item.id);
      if (item.id === 'b' && fail) throw Error('missing');
    });
    const first = await runner.run(workspace);
    expect(calls).toEqual(['a', 'b', 'c']);
    expect(first.map((r) => r.status)).toEqual(['success', 'error', 'success']);
    fail = false;
    await runner.run(
      workspace,
      first.filter((item) => item.status === 'error').map((item) => item.id),
    );
    expect(calls).toEqual(['a', 'b', 'c', 'b']);
  });
  it('取消不再启动后续项目，同一工作区不能重复运行', async () => {
    let finish!: () => void;
    const runner = new WorkspaceRunner(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = runner.run(workspace);
    await expect(runner.run(workspace)).rejects.toThrow();
    runner.cancel(workspace.id);
    finish();
    expect((await pending).map((r) => r.status)).toEqual(['success', 'cancelled', 'cancelled']);
  });
  it('验证 URL、结构化参数与重复 ID', () => {
    const config = { version: 1, revision: 0, snippets: [], workspaces: [workspace] };
    expect(validateProductivity(config).workspaces[0].items[1].args).toEqual(['/tmp/a;echo bad']);
    expect(() =>
      validateProductivity({
        ...config,
        workspaces: [
          { ...workspace, items: [{ id: 'x', kind: 'url', target: 'javascript:alert(1)' }] },
        ],
      }),
    ).toThrow();
    expect(() => validateProductivity({ ...config, workspaces: [workspace, workspace] })).toThrow();
  });
  it('文件路径原样作为单个参数传给程序，不拼接 shell 文本', () => {
    const target = '/tmp/a; touch hacked';
    expect(
      workspaceInvocation(
        { id: 'a', kind: 'editor', program: '/usr/bin/editor', target, args: ['--new-window'] },
        'darwin',
      ),
    ).toEqual({ program: '/usr/bin/editor', args: ['--new-window', target] });
    expect(workspaceInvocation({ id: 'a', kind: 'terminal', target }, 'win32')).toEqual({
      program: 'cmd.exe',
      args: ['/k'],
      cwd: target,
    });
  });
  it('拒绝过期配置写入，指令 ID 不随名称修改而改变', () => {
    let value: unknown;
    const manager = new Productivity({
      get: <T>(_key: string, fallback: T) => (value ?? fallback) as T,
      set: (_key, next) => {
        value = next;
      },
    });
    const config = manager.read();
    const next = manager.save({
      ...config,
      snippets: [{ id: 'hello', name: '问候', group: '', body: '你好' }],
    });
    expect(manager.commands()[0].id).toBe('snippet:hello');
    expect(() => manager.save(config)).toThrow('其他窗口');
    manager.save({ ...next, snippets: [{ ...next.snippets[0], name: '更新名称' }] });
    expect(manager.commands()[0].id).toBe('snippet:hello');
  });
});
