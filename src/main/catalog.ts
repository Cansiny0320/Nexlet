import { formatLocale, t } from '../shared/i18n';
import { linuxDataRoots, scanLinuxApplications, linuxIconPath } from './linux-desktop';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { app, shell } from 'electron';
import type { Command } from '../shared/types';
import { loadCatalogIcon, windowsIconFingerprint } from './catalog-icons';
import type { CatalogCache } from './catalog-cache';
import { loadMacCatalogIcons, loadMacCatalogNames } from './catalog-mac';
import { readWindowsApplications } from './catalog-windows';
import { loadMacSystemIcons } from './system-icons-mac';
import { isAuxiliaryWindowsShortcut } from './catalog-shortcut-filter';

function shortcutIdentity(shortcut?: {
  target: string;
  args?: string;
  cwd?: string;
}): string | undefined {
  if (!shortcut) return;
  const { target, args, cwd } = shortcut;
  if (!target || !path.win32.isAbsolute(target)) return;
  // Arguments may be case-sensitive. A distinct working directory can also
  // change behavior, so only normalize the Windows paths.
  return JSON.stringify([
    path.win32.normalize(target).toLowerCase(),
    args || '',
    cwd ? path.win32.normalize(cwd).toLowerCase() : '',
  ]);
}

interface ScanRequest {
  extra: string[];
  context: string;
}

function windowsRoots(): string[] {
  return [
    path.join(process.env.APPDATA || homedir(), 'Microsoft/Windows/Start Menu/Programs'),
    path.join(process.env.PROGRAMDATA || 'C:/ProgramData', 'Microsoft/Windows/Start Menu/Programs'),
    app.getPath('desktop'),
    path.join(process.env.PUBLIC || 'C:/Users/Public', 'Desktop'),
  ];
}

export class Catalog {
  items: Command[] = [];
  loading = false;
  revision = 0;
  private icons = new Map<string, string>();
  private iconSources = new Map<string, string>();
  private aliases = new Map<string, string>();
  private systemIcons?: Promise<Map<string, string>>;
  private fingerprints = new Map<string, string>();
  private iconLoads = new Map<string, { revision: number; promise: Promise<string | undefined> }>();
  private scanning?: Promise<void>;
  private activeContext?: string;
  private pendingScan?: ScanRequest;
  private closed = false;
  private hasSnapshot = false;
  constructor(
    private changed: () => void,
    private cache?: CatalogCache,
  ) {}
  private context(extra: string[]): string {
    return JSON.stringify([
      1,
      process.platform,
      formatLocale(),
      process.platform === 'win32'
        ? [...windowsRoots(), ...extra].map((file) => path.win32.resolve(file).toLowerCase())
        : extra,
    ]);
  }
  restore(extra: string[] = []): void {
    if (this.closed || process.platform !== 'win32') return;
    const snapshot = this.cache?.load(this.context(extra));
    if (!snapshot) return;
    this.items = snapshot.items;
    this.aliases = new Map(snapshot.aliases);
    this.iconSources = new Map(snapshot.iconSources);
    this.fingerprints = new Map(snapshot.fingerprints);
    this.hasSnapshot = true;
    this.revision++;
  }
  resolveIds(ids: string[]): string[] {
    return [...new Set(ids.map((id) => this.aliases.get(id) || id))];
  }
  scan(extra: string[] = []): Promise<void> {
    if (this.closed) return Promise.resolve();
    const request = { extra: [...extra], context: this.context(extra) };
    if (this.scanning) {
      this.pendingScan = request.context === this.activeContext ? undefined : request;
      return this.scanning;
    }
    this.scanning = this.runScans(request).finally(() => {
      this.scanning = undefined;
    });
    return this.scanning;
  }
  private async runScans(request: ScanRequest): Promise<void> {
    this.loading = true;
    this.changed();
    try {
      let next: ScanRequest | undefined = request;
      while (next && !this.closed) {
        this.activeContext = next.context;
        this.pendingScan = undefined;
        try {
          await this.scanOnce(next);
        } catch (error) {
          console.warn('Application catalog scan failed:', error);
        }
        next = this.pendingScan;
      }
    } finally {
      this.loading = false;
      this.activeContext = undefined;
      if (!this.closed) this.changed();
    }
  }
  private async scanOnce(request: ScanRequest): Promise<void> {
    const { extra } = request;
    const iconSources = new Map<string, string>();
    const links = new Map<string, Electron.ShortcutDetails>();
    let failed = false;
    if (process.platform === 'linux') {
      const items = await scanLinuxApplications([
        ...linuxDataRoots().map((root) => path.join(root, 'applications')),
        ...extra,
      ]);
      if (this.closed || this.pendingScan) return;
      for (const item of items) {
        if (item.icon) iconSources.set(item.id, item.icon);
        delete item.icon;
      }
      this.icons.clear();
      this.iconSources = iconSources;
      this.aliases.clear();
      this.items = items.sort((a, b) => a.name.localeCompare(b.name, formatLocale()));
      this.revision++;
      return;
    }
    const roots =
      process.platform === 'win32'
        ? windowsRoots()
        : process.platform === 'darwin'
          ? [
              '/Applications',
              '/System/Applications',
              '/System/Library/CoreServices/Applications',
              path.join(homedir(), 'Applications'),
              app.getPath('desktop'),
            ]
          : ['/usr/share/applications', path.join(homedir(), '.local/share/applications')];
    const found = new Map<string, Command>();
    const identities = new Map<string, string>();
    const aliases = new Map<string, string>();
    const visit = async (directory: string, depth: number): Promise<void> => {
      if (depth > 8 || found.size > 5000) return;
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failed = true;
        return;
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
        const full = path.join(directory, entry.name);
        const macApp =
          process.platform === 'darwin' && entry.isDirectory() && entry.name.endsWith('.app');
        const shortcut = process.platform === 'win32' && /\.(lnk|url)$/i.test(entry.name);
        const executable =
          process.platform === 'win32' && /\.exe$/i.test(entry.name) && extra.includes(directory);
        if (macApp || shortcut || executable) {
          const id =
            'app:' +
            createHash('sha256')
              .update(process.platform === 'win32' ? full.toLowerCase() : full)
              .digest('hex')
              .slice(0, 20);
          const name = entry.name.replace(/\.(lnk|url|app|exe)$/i, '');
          let link: ReturnType<typeof shell.readShortcutLink> | undefined;
          if (shortcut && /\.lnk$/i.test(entry.name)) {
            try {
              link = shell.readShortcutLink(full);
            } catch {
              /* Keep unreadable links unless their name identifies an auxiliary entry. */
            }
          }
          if (shortcut && isAuxiliaryWindowsShortcut(name, link)) continue;
          const identity = shortcutIdentity(link);
          const existing = identity ? found.get(identities.get(identity) || '') : undefined;
          if (existing) {
            aliases.set(id, existing.id);
            if (name !== existing.name && !existing.keywords.includes(name))
              existing.keywords.push(name);
            continue;
          }
          if (identity) identities.set(identity, id);
          if (link) links.set(id, link);
          found.set(id, {
            id,
            name,
            subtitle: shortcut ? t('快捷方式 · {{v0}}', { v0: directory }) : directory,
            kind: shortcut ? 'shortcut' : 'app',
            keywords: [],
            path: full,
          });
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
        found.set(id, {
          id,
          name,
          subtitle: path.dirname(full),
          kind: 'app',
          keywords: [],
          path: full,
        });
      }
      const names = await loadMacCatalogNames([...found.values()].map((item) => item.path!));
      for (const item of found.values()) {
        const localized = names.get(item.path!);
        if (localized && localized !== item.name) {
          item.keywords.push(item.name);
          item.name = localized;
        }
      }
    }
    // UWP applications do not necessarily have .lnk files. Read their registered AppUserModelIDs.
    if (process.platform === 'win32') {
      try {
        for (const item of await readWindowsApplications()) {
          if ([...found.values()].some((v) => v.name === item.Name)) continue;
          const id = 'uwp:' + item.AppID;
          if (typeof item.IconPath === 'string' && item.IconPath)
            iconSources.set(id, item.IconPath);
          found.set(id, {
            id,
            name: String(item.Name),
            subtitle: t('Windows 应用'),
            kind: 'app',
            keywords: [],
          });
        }
      } catch (error) {
        failed = true;
        console.warn(t('系统应用索引暂不可用'), (error as Error).message);
      }
    }
    if (this.closed || this.pendingScan || (this.cache && failed && this.hasSnapshot)) return;
    const items = [...found.values()].sort((a, b) => a.name.localeCompare(b.name, formatLocale()));
    const fingerprints = new Map<string, string>();
    if (this.cache) {
      for (let offset = 0; offset < items.length; offset += 32) {
        const batch = await Promise.all(
          items.slice(offset, offset + 32).map(async (item) => {
            const source = iconSources.get(item.id) || item.path;
            return [
              item.id,
              source
                ? await windowsIconFingerprint(source, links.get(item.id))
                : createHash('sha256').update(item.id).digest('hex'),
            ] as const;
          }),
        );
        for (const [id, fingerprint] of batch) fingerprints.set(id, fingerprint);
        if (this.closed || this.pendingScan) return;
      }
      for (const id of this.icons.keys())
        if (this.fingerprints.get(id) !== fingerprints.get(id) || !fingerprints.has(id))
          this.icons.delete(id);
    } else this.icons.clear();
    this.aliases = aliases;
    this.iconSources = iconSources;
    this.fingerprints = fingerprints;
    this.items = items;
    this.revision++;
    this.iconLoads.clear();
    if (!failed) {
      this.hasSnapshot = true;
      this.cache?.save({
        context: request.context,
        items,
        aliases: [...aliases],
        iconSources: [...iconSources],
        fingerprints: [...fingerprints],
      });
    }
  }
  async withIcons(items: Command[]): Promise<Command[]> {
    if (this.cache)
      return Promise.all(
        items.map(async (item) => ({ ...item, icon: await this.cachedIcon(item) })),
      );
    let systemIcons: Map<string, string> | undefined;
    if (process.platform === 'darwin') {
      if (items.some((item) => item.kind === 'system' && item.id.startsWith('system:settings:'))) {
        systemIcons = await (this.systemIcons ??= loadMacSystemIcons());
      }
      const missing = items.filter(
        (item) => !this.icons.has(item.id) && item.path?.endsWith('.app'),
      );
      const loaded = await loadMacCatalogIcons(missing.map((item) => item.path!));
      for (const item of missing) {
        const icon = loaded.get(item.path!);
        if (icon) this.icons.set(item.id, icon);
      }
    }
    return Promise.all(
      items.map(async (item) => {
        if (systemIcons?.has(item.id)) return { ...item, icon: systemIcons.get(item.id) };
        let source = this.iconSources.get(item.id) || item.path;
        if (
          process.platform === 'linux' &&
          this.iconSources.has(item.id) &&
          !this.icons.has(item.id)
        ) {
          source = (await linuxIconPath(this.iconSources.get(item.id)!)) || item.path;
          if (source?.endsWith('.svg'))
            try {
              const bytes = await readFile(source);
              if (bytes.length < 1024 * 1024)
                this.icons.set(item.id, 'data:image/svg+xml;base64,' + bytes.toString('base64'));
            } catch {}
        }
        if (!source) return item;
        if (!this.icons.has(item.id)) {
          this.icons.set(item.id, await loadCatalogIcon(source));
        }
        return { ...item, icon: this.icons.get(item.id) };
      }),
    );
  }
  private async cachedIcon(item: Command): Promise<string | undefined> {
    if (this.closed) return;
    if (this.icons.has(item.id)) return this.icons.get(item.id);
    const fingerprint = this.fingerprints.get(item.id);
    const cached = fingerprint && this.cache?.getIcon(item.id, fingerprint);
    if (cached) {
      this.icons.set(item.id, cached);
      return cached;
    }
    const source = this.iconSources.get(item.id) || item.path;
    if (!source) return item.icon;
    const revision = this.revision;
    const existing = this.iconLoads.get(item.id);
    if (existing?.revision === revision) return existing.promise;
    const promise = loadCatalogIcon(source)
      .then((icon) => {
        if (this.closed || this.revision !== revision) return;
        if (icon) {
          this.icons.set(item.id, icon);
          if (fingerprint) this.cache?.setIcon(item.id, fingerprint, icon);
        }
        return icon;
      })
      .catch(() => undefined)
      .finally(() => {
        if (this.iconLoads.get(item.id)?.promise === promise) this.iconLoads.delete(item.id);
      });
    this.iconLoads.set(item.id, { revision, promise });
    return promise;
  }
  close(): void {
    this.closed = true;
    this.pendingScan = undefined;
    this.revision++;
    this.cache?.close();
  }
}
