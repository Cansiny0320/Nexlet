import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { app } from 'electron';
import type { Command } from '../shared/types';

const exec = promisify(execFile);
export class Catalog {
  items: Command[] = [];
  loading = false;
  private icons = new Map<string, string>();
  constructor(private changed: () => void) {}
  async scan(extra: string[] = []): Promise<void> {
    if (this.loading) return;
    this.loading = true; this.changed();
    try {
      const roots = process.platform === 'win32' ? [
        path.join(process.env.APPDATA || homedir(), 'Microsoft/Windows/Start Menu/Programs'),
        path.join(process.env.PROGRAMDATA || 'C:/ProgramData', 'Microsoft/Windows/Start Menu/Programs'),
        app.getPath('desktop'), path.join(process.env.PUBLIC || 'C:/Users/Public', 'Desktop')
      ] : process.platform === 'darwin' ? ['/Applications', '/System/Applications', path.join(homedir(), 'Applications'), app.getPath('desktop')] : ['/usr/share/applications', path.join(homedir(), '.local/share/applications')];
      const found = new Map<string, Command>();
      const visit = async (directory: string, depth: number): Promise<void> => {
        if (depth > 8 || found.size > 5000) return;
        let entries; try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
          const full = path.join(directory, entry.name);
          const macApp = process.platform === 'darwin' && entry.isDirectory() && entry.name.endsWith('.app');
          const shortcut = process.platform === 'win32' && /\.(lnk|url)$/i.test(entry.name);
          const executable = process.platform === 'win32' && /\.exe$/i.test(entry.name) && extra.includes(directory);
          if (macApp || shortcut || executable) {
            const id = 'app:' + createHash('sha256').update(process.platform === 'win32' ? full.toLowerCase() : full).digest('hex').slice(0, 20);
            const name = entry.name.replace(/\.(lnk|url|app|exe)$/i, '');
            found.set(id, { id, name, subtitle: shortcut ? `快捷方式 · ${directory}` : directory, kind: shortcut ? 'shortcut' : 'app', keywords: [], path: full, icon: this.icons.get(id) });
          } else if (entry.isDirectory()) await visit(full, depth + 1);
        }
      };
      for (const root of new Set([...roots, ...extra])) await visit(root, 0);
      // UWP applications do not necessarily have .lnk files. Read their registered AppUserModelIDs.
      if (process.platform === 'win32') {
        try {
          const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress'], { windowsHide: true, timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
          const parsed = JSON.parse(stdout || '[]');
          for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
            if (typeof item.AppID !== 'string' || !/^[a-zA-Z0-9_.-]+![a-zA-Z0-9_.-]+$/.test(item.AppID)) continue;
            if ([...found.values()].some(v => v.name === item.Name)) continue;
            const id = 'uwp:' + item.AppID;
            found.set(id, { id, name: String(item.Name), subtitle: 'Windows 应用', kind: 'app', keywords: [] });
          }
        } catch (error) { console.warn('系统应用索引暂不可用', (error as Error).message); }
      }
      this.items = [...found.values()].sort((a,b) => a.name.localeCompare(b.name,'zh-CN'));
    } finally { this.loading = false; this.changed(); }
  }
  async withIcons(items: Command[]): Promise<Command[]> {
    return Promise.all(items.map(async item => {
      if (!item.path) return item;
      if (!this.icons.has(item.id)) {
        try { await stat(item.path); const icon = await app.getFileIcon(item.path, { size:'normal' }); this.icons.set(item.id, icon.toDataURL()); }
        catch { this.icons.set(item.id, ''); }
      }
      return { ...item, icon: this.icons.get(item.id) };
    }));
  }
}
