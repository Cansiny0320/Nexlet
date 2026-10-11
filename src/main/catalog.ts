import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { app } from 'electron';
import type { Command } from '../shared/types';
import { loadCatalogIcon } from './catalog-icons';
import { readWindowsApplications } from './catalog-windows';

export class Catalog {
  items: Command[] = [];
  loading = false;
  private icons = new Map<string, string>();
  private iconSources = new Map<string, string>();
  constructor(private changed: () => void) {}
  async scan(extra: string[] = []): Promise<void> {
    if (this.loading) return;
    this.loading = true; this.changed();
    try {
      this.icons.clear();
      this.iconSources.clear();
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
          for (const item of await readWindowsApplications()) {
            if ([...found.values()].some(v => v.name === item.Name)) continue;
            const id = 'uwp:' + item.AppID;
            if (typeof item.IconPath === 'string' && item.IconPath) this.iconSources.set(id, item.IconPath);
            found.set(id, { id, name: String(item.Name), subtitle: 'Windows 应用', kind: 'app', keywords: [] });
          }
        } catch (error) { console.warn('系统应用索引暂不可用', (error as Error).message); }
      }
      this.items = [...found.values()].sort((a,b) => a.name.localeCompare(b.name,'zh-CN'));
    } finally { this.loading = false; this.changed(); }
  }
  async withIcons(items: Command[]): Promise<Command[]> {
    return Promise.all(items.map(async item => {
      const source = this.iconSources.get(item.id) || item.path;
      if (!source) return item;
      if (!this.icons.has(item.id)) {
        this.icons.set(item.id, await loadCatalogIcon(source));
      }
      return { ...item, icon: this.icons.get(item.id) };
    }));
  }
}
