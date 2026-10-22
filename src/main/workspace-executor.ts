import { stat } from 'node:fs/promises';
import type { WorkspaceItem } from '../shared/productivity';
import { t } from '../shared/i18n';

export function workspaceInvocation(item: WorkspaceItem, platform: NodeJS.Platform) {
  if (item.kind === 'editor')
    return { program: item.program!, args: [...(item.args || []), item.target] };
  if (item.program) return { program: item.program, args: item.args || [], cwd: item.target };
  if (platform === 'darwin')
    return { program: '/usr/bin/open', args: ['-a', 'Terminal', item.target] };
  if (platform === 'win32') return { program: 'cmd.exe', args: ['/k'], cwd: item.target };
  return { program: 'x-terminal-emulator', args: [], cwd: item.target };
}
export async function executeWorkspaceItem(
  item: WorkspaceItem,
  runtime: {
    platform: NodeJS.Platform;
    openPath(path: string): Promise<string>;
    openExternal(url: string): Promise<void>;
    start(program: string, args: string[], cwd?: string): Promise<void>;
  },
) {
  if (item.kind === 'url') {
    await runtime.openExternal(item.target);
    return;
  }
  const target = await stat(item.target).catch(() => {
    throw Error(t('文件已移动或不存在'));
  });
  if (['folder', 'terminal'].includes(item.kind) && !target.isDirectory())
    throw Error(t('请选择目录'));
  if (item.kind === 'app' || item.kind === 'folder') {
    const error = await runtime.openPath(item.target);
    if (error) throw Error(error);
    return;
  }
  if (item.program && !(await stat(item.program)).isFile()) throw Error(t('请选择可执行程序'));
  const invocation = workspaceInvocation(item, runtime.platform);
  await runtime.start(
    invocation.program,
    invocation.args,
    'cwd' in invocation ? invocation.cwd : undefined,
  );
}
