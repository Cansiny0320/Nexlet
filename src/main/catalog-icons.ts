import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { app, nativeImage, shell } from 'electron';

async function windowsIconSources(file: string, link?: Electron.ShortcutDetails): Promise<string[]> {
  const candidates: string[] = [];
  if (/\.lnk$/i.test(file)) {
    try {
      const shortcut = link || shell.readShortcutLink(file);
      // getFileIcon(.lnk) returns the generic link icon on current Electron/Windows.
      // Resolve the icon resource or executable instead; launching still uses the .lnk.
      if (shortcut.icon) candidates.push(shortcut.icon);
      if (shortcut.target) candidates.push(shortcut.target);
    } catch { /* Keep the shortcut's generic fallback when its target is unavailable. */ }
  } else if (/\.url$/i.test(file)) {
    try {
      const content = await readFile(file, 'utf8');
      const icon = content.match(/^IconFile\s*=\s*(.+)$/mi)?.[1].trim();
      if (icon && path.isAbsolute(icon) && !icon.startsWith('\\\\')) candidates.push(icon);
    } catch { /* A missing URL icon must not hide the search result. */ }
  }
  candidates.push(file);
  return [...new Set(candidates.map(source => source.replace(/%([^%]+)%/g, (whole, name: string) => process.env[name] || whole)))];
}

export async function windowsIconFingerprint(file: string, link?: Electron.ShortcutDetails): Promise<string> {
  const sources = await windowsIconSources(file, link);
  const resources = await Promise.all(sources.map(async source => {
    try {
      const info = await stat(source);
      return [path.win32.normalize(source).toLowerCase(), info.size, info.mtimeMs, info.ctimeMs];
    } catch (error) { return [source, (error as NodeJS.ErrnoException).code || 'unavailable']; }
  }));
  return createHash('sha256').update(JSON.stringify([resources, link?.iconIndex])).digest('hex');
}

export async function loadCatalogIcon(file: string, platform = process.platform): Promise<string> {
  const sources = platform === 'win32' ? await windowsIconSources(file) : [file];
  for (const expanded of sources) {
    try {
      const icon = /\.(png|jpe?g|bmp)$/i.test(expanded) || (platform === 'win32' && /\.ico$/i.test(expanded))
        ? nativeImage.createFromPath(expanded)
        : await app.getFileIcon(expanded, { size: 'normal' });
      if (!icon.isEmpty()) return icon.toDataURL();
    } catch { /* Try the next resource. */ }
  }
  return '';
}
