import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { app, nativeImage, shell } from 'electron';
import { loadWindowsResourceIcon } from './catalog-icons-windows';

interface IconSource {
  file: string;
  index: number;
}
async function windowsIconSources(
  file: string,
  link?: Electron.ShortcutDetails,
): Promise<IconSource[]> {
  const candidates: IconSource[] = [];
  if (/\.lnk$/i.test(file)) {
    try {
      const shortcut = link || shell.readShortcutLink(file);
      // getFileIcon(.lnk) returns the generic link icon on current Electron/Windows.
      // Resolve the icon resource or executable instead; launching still uses the .lnk.
      if (shortcut.icon) candidates.push({ file: shortcut.icon, index: shortcut.iconIndex || 0 });
      if (shortcut.target) candidates.push({ file: shortcut.target, index: 0 });
    } catch {
      /* Keep the shortcut's generic fallback when its target is unavailable. */
    }
  } else if (/\.url$/i.test(file)) {
    try {
      const content = await readFile(file, 'utf8');
      const icon = content.match(/^IconFile\s*=\s*(.+)$/im)?.[1].trim();
      const index = Number(content.match(/^IconIndex\s*=\s*(-?\d+)\s*$/im)?.[1] || 0);
      if (icon && path.isAbsolute(icon) && !icon.startsWith('\\\\'))
        candidates.push({
          file: icon,
          index:
            Number.isSafeInteger(index) && index >= -2147483648 && index <= 2147483647 ? index : 0,
        });
    } catch {
      /* A missing URL icon must not hide the search result. */
    }
  }
  candidates.push({ file, index: 0 });
  const unique = new Map<string, IconSource>();
  for (const source of candidates) {
    const expanded = {
      ...source,
      file: source.file.replace(/%([^%]+)%/g, (whole, name: string) => process.env[name] || whole),
    };
    unique.set(JSON.stringify([expanded.file, expanded.index]), expanded);
  }
  return [...unique.values()];
}

export async function windowsIconFingerprint(
  file: string,
  link?: Electron.ShortcutDetails,
): Promise<string> {
  const sources = await windowsIconSources(file, link);
  const resources = await Promise.all(
    sources.map(async (source) => {
      try {
        const info = await stat(source.file);
        return [
          path.win32.normalize(source.file).toLowerCase(),
          source.index,
          info.size,
          info.mtimeMs,
          info.ctimeMs,
        ];
      } catch (error) {
        return [source.file, source.index, (error as NodeJS.ErrnoException).code || 'unavailable'];
      }
    }),
  );
  return createHash('sha256')
    .update(JSON.stringify([resources, link?.iconIndex]))
    .digest('hex');
}

export async function loadCatalogIcon(file: string, platform = process.platform): Promise<string> {
  const sources = platform === 'win32' ? await windowsIconSources(file) : [{ file, index: 0 }];
  const raster = (source: string) =>
    /\.(png|jpe?g|bmp)$/i.test(source) || (platform === 'win32' && /\.ico$/i.test(source));
  for (const source of sources) {
    try {
      if (raster(source.file)) {
        const icon = nativeImage.createFromPath(source.file);
        if (!icon.isEmpty()) return icon.toDataURL();
      } else if (platform === 'win32' && /\.(exe|dll|icl|cpl|scr|mun)$/i.test(source.file)) {
        const icon = await loadWindowsResourceIcon(source.file, source.index);
        if (icon) return icon;
      }
    } catch {
      /* Try the next resource before accepting a generic file icon. */
    }
  }
  for (const source of sources) {
    if (raster(source.file)) continue;
    try {
      const icon = await app.getFileIcon(source.file, { size: 'normal' });
      if (!icon.isEmpty()) return icon.toDataURL();
    } catch {
      /* Try the next resource. */
    }
  }
  return '';
}
