import type { Command } from '../shared/types';
import { systemCommands, type SystemAction } from './system-commands';

export interface SystemExecutor {
  open(url: string): Promise<void>;
  execute(action: SystemAction): Promise<void>;
}

export class SystemActions {
  private entries;
  private busy = false;
  constructor(platform: string, release: string, private executor: SystemExecutor) {
    this.entries = systemCommands(platform, release);
  }
  commands(): Command[] {
    return this.entries.map(({ url: _url, action: _action, confirm: _confirm, ...command }) => command);
  }
  async launch(id: string, confirm: (command: Command) => Promise<boolean>): Promise<boolean> {
    const entry = this.entries.find(c => c.id === id);
    if (!entry) throw Error('系统命令不存在或不支持当前系统');
    if (this.busy) throw Error('正在处理系统操作，请稍候');
    this.busy = true;
    try {
      if (entry.confirm && !await confirm(entry)) return false;
      if (entry.url) await this.executor.open(entry.url);
      else if (entry.action) await this.executor.execute(entry.action);
      return true;
    } finally { this.busy = false; }
  }
}
