import { t } from '../shared/i18n';
import { access, readdir, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Command } from '../shared/types';
const exec = promisify(execFile);
const absolute = (value: string | undefined, fallback: string) =>
  value && path.isAbsolute(value) ? value : fallback;
export function linuxDataRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  return [
    ...new Set([
      absolute(env.XDG_DATA_HOME, path.join(homedir(), '.local/share')),
      ...(env.XDG_DATA_DIRS || '/usr/local/share:/usr/share')
        .split(':')
        .filter((p) => path.isAbsolute(p)),
      path.join(homedir(), '.local/share/flatpak/exports/share'),
      '/var/lib/flatpak/exports/share',
    ]),
  ];
}
export function desktopEntry(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  let active = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('[')) {
      active = line.trim() === '[Desktop Entry]';
      continue;
    }
    if (!active || line.startsWith('#')) continue;
    const equal = line.indexOf('=');
    if (equal < 1) continue;
    values[line.slice(0, equal).trim()] = line
      .slice(equal + 1)
      .replace(
        /\\([sntr\\])/g,
        (_, c) => ({ s: ' ', n: '\n', t: '\t', r: '\r', '\\': '\\' })[c as string] || c,
      );
  }
  return values;
}
async function executable(value: string, env: NodeJS.ProcessEnv) {
  const candidates = path.isAbsolute(value)
    ? [value]
    : (env.PATH || '/usr/local/bin:/usr/bin:/bin')
        .split(':')
        .filter((p) => path.isAbsolute(p))
        .map((p) => path.join(p, value));
  for (const file of candidates)
    try {
      await access(file, constants.X_OK);
      if ((await stat(file)).isFile()) return true;
    } catch {}
  return false;
}
export async function scanLinuxApplications(
  roots: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<Command[]> {
  const seen = new Set<string>(),
    items: Command[] = [];
  const locale = (env.LC_ALL || env.LC_MESSAGES || env.LANG || 'en').replace(/\.[^@]+/, '');
  const locales = [locale, locale.split('@')[0], locale.split('_')[0]];
  const desktops = (env.XDG_CURRENT_DESKTOP || '').split(':');
  for (const root of roots) {
    const visit = async (directory: string, depth: number): Promise<void> => {
      if (depth > 8 || seen.size >= 5000) return;
      for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
        if (seen.size >= 5000) break;
        if (entry.name.startsWith('.')) continue;
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await visit(file, depth + 1);
          continue;
        }
        if (!entry.name.endsWith('.desktop')) continue;
        const id = path.relative(root, file).split(path.sep).join('-');
        if (seen.has(id)) continue;
        seen.add(id);
        try {
          const info = await stat(file);
          if (!info.isFile() || info.size > 128 * 1024) continue;
          const value = desktopEntry(await readFile(file, 'utf8'));
          if (
            value.Hidden === 'true' ||
            value.NoDisplay === 'true' ||
            value.Type !== 'Application' ||
            !value.Name ||
            (!value.Exec && value.DBusActivatable !== 'true')
          )
            continue;
          if (value.OnlyShowIn && !value.OnlyShowIn.split(';').some((d) => desktops.includes(d)))
            continue;
          if (value.NotShowIn && value.NotShowIn.split(';').some((d) => d && desktops.includes(d)))
            continue;
          if (value.TryExec && !(await executable(value.TryExec, env))) continue;
          const name = locales.map((l) => value[`Name[${l}]`]).find(Boolean) || value.Name;
          items.push({
            id: 'linux-app:' + id,
            name,
            kind: 'app',
            path: file,
            subtitle: value.Comment || directory,
            keywords: [value.Name, value.GenericName || '', ...(value.Keywords || '').split(';')],
            ...(value.Icon ? { icon: value.Icon } : {}),
          });
        } catch {} // Broken desktop entries must not prevent the rest of the catalog from loading.
      }
    };
    await visit(root, 0);
  }
  return items;
}
export async function linuxIconPath(icon: string): Promise<string | undefined> {
  if (path.isAbsolute(icon)) return icon;
  if (!/^[\w.+-]+$/.test(icon)) return;
  for (const root of linuxDataRoots()) {
    for (const theme of ['hicolor', 'Adwaita', 'AdwaitaLegacy', 'breeze'])
      for (const size of ['48x48', '64x64', '128x128', '256x256', '512x512', 'scalable', '32x32'])
        for (const ext of ['png', 'svg', 'xpm']) {
          const file = path.join(root, 'icons', theme, size, 'apps', `${icon}.${ext}`);
          try {
            await access(file);
            return file;
          } catch {}
        }
    for (const ext of ['png', 'svg', 'xpm']) {
      const file = path.join(root, 'pixmaps', `${icon}.${ext}`);
      try {
        await access(file);
        return file;
      } catch {}
    }
  }
}
export async function launchLinuxApplication(file: string): Promise<void> {
  if (!path.isAbsolute(file) || !file.endsWith('.desktop') || /[\0\r\n]/.test(file))
    throw Error(t('应用入口无效'));
  try {
    await exec('gio', ['launch', file], { timeout: 10000, maxBuffer: 64 * 1024 });
  } catch (error) {
    throw Error(
      (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? t('缺少 gio，请安装 libglib2.0-bin 后重试')
        : t('无法启动应用，请检查应用是否仍已安装'),
    );
  }
}
