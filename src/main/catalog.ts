import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { app, shell } from 'electron';
import type { Command } from '../shared/types';
import { loadCatalogIcon } from './catalog-icons';
import { loadMacCatalogIcons, loadMacCatalogNames } from './catalog-mac';
import { readWindowsApplications } from './catalog-windows';
import { loadMacSystemIcons } from './system-icons-mac';

function shortcutIdentity(file: string): string | undefined {
  if (process.platform !== 'win32' || !/\.lnk$/i.test(file)) return;
  try {
    const { target, args, cwd } = shell.readShortcutLink(file);
    if (!target || !path.win32.isAbsolute(target)) return;
    // Arguments may be case-sensitive. A distinct working directory can also
    // change behavior, so only normalize the Windows paths.
    return JSON.stringify([
      path.win32.normalize(target).toLowerCase(), args || '',
      cwd ? path.win32.normalize(cwd).toLowerCase() : ''
    ]);
  } catch { return; } // An unreadable link remains a separate, launchable entry.
}

export class Catalog {
  items: Command[] = [];
  loading = false;
  private icons = new Map<string, string>();
  private iconSources = new Map<string, string>();
  private aliases = new Map<string, string>();
  private systemIcons?: Promise<Map<string, string>>;
  constructor(private changed: () => void) {}
  resolveIds(ids: string[]): string[] {
    return [...new Set(ids.map(id => this.aliases.get(id) || id))];
  }
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
      ] : process.platform === 'darwin' ? ['/Applications', '/System/Applications', '/System/Library/CoreServices/Applications', path.join(homedir(), 'Applications'), app.getPath('desktop')] : ['/usr/share/applications', path.join(homedir(), '.local/share/applications')];
      const found = new Map<string, Command>();
      const identities = new Map<string, string>();
      const aliases = new Map<string, string>();
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
            const identity = shortcutIdentity(full);
            const existing = identity ? found.get(identities.get(identity) || '') : undefined;
            if (existing) {
              aliases.set(id, existing.id);
              if (name !== existing.name && !existing.keywords.includes(name)) existing.keywords.push(name);
              continue;
            }
            if (identity) identities.set(identity, id);
            found.set(id, { id, name, subtitle: shortcut ? `快捷方式 · ${directory}` : directory, kind: shortcut ? 'shortcut' : 'app', keywords: [], path: full, icon: this.icons.get(id) });
          } else if (entry.isDirectory()) await visit(full, depth + 1);
        }
      };
      for (const root of new Set([...roots, ...extra])) await visit(root, 0);
      if (process.platform === 'darwin') {
        // CoreServices also contains background agents: index only these launchable bundles.
        for (const name of ['Finder', 'Paired Devices', 'Ticket Viewer']) {
          const full = `/System/Library/CoreServices/${name}.app`;
          if (!(await stat(full).catch(() => null))?.isDirectory()) continue;
          const id = 'app:' + createHash('sha256').update(full).digest('hex').slice(0, 20);
          found.set(id, { id, name, subtitle: path.dirname(full), kind: 'app', keywords: [], path: full });
        }
        const names = await loadMacCatalogNames([...found.values()].map(item => item.path!));
        for (const item of found.values()) {
          const localized = names.get(item.path!);
          if (localized && localized !== item.name) { item.keywords.push(item.name); item.name = localized; }
        }
      }
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
      this.aliases = aliases;
      this.items = [...found.values()].sort((a,b) => a.name.localeCompare(b.name,'zh-CN'));
    } finally { this.loading = false; this.changed(); }
  }
  async withIcons(items: Command[]): Promise<Command[]> {
    let systemIcons: Map<string, string> | undefined;
    if (process.platform === 'darwin') {
      if (items.some(item => item.kind === 'system' && item.id.startsWith('system:settings:'))) {
        systemIcons = await (this.systemIcons ??= loadMacSystemIcons());
      }
      const missing = items.filter(item => !this.icons.has(item.id) && item.path?.endsWith('.app'));
      const loaded = await loadMacCatalogIcons(missing.map(item => item.path!));
      for (const item of missing) {
        const icon = loaded.get(item.path!);
        if (icon) this.icons.set(item.id, icon);
      }
    }
    return Promise.all(items.map(async item => {
      if (systemIcons?.has(item.id)) return { ...item, icon: systemIcons.get(item.id) };
      const source = this.iconSources.get(item.id) || item.path;
      if (!source) return item;
      if (!this.icons.has(item.id)) {
        this.icons.set(item.id, await loadCatalogIcon(source));
      }
      return { ...item, icon: this.icons.get(item.id) };
    }));
  }
}
