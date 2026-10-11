import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { app, nativeImage, shell } from 'electron';

export async function loadCatalogIcon(file: string, platform = process.platform): Promise<string> {
  const candidates: string[] = [];
  if (platform === 'win32' && /\.lnk$/i.test(file)) {
    try {
      const shortcut = shell.readShortcutLink(file);
      // getFileIcon(.lnk) returns the generic link icon on current Electron/Windows.
      // Resolve the icon resource or executable instead; launching still uses the .lnk.
      if (shortcut.icon) candidates.push(shortcut.icon);
      if (shortcut.target) candidates.push(shortcut.target);
    } catch { /* Keep the shortcut's generic fallback when its target is unavailable. */ }
  } else if (platform === 'win32' && /\.url$/i.test(file)) {
    try {
      const content = await readFile(file, 'utf8');
      const icon = content.match(/^IconFile\s*=\s*(.+)$/mi)?.[1].trim();
      if (icon && path.isAbsolute(icon) && !icon.startsWith('\\\\')) candidates.push(icon);
    } catch { /* A missing URL icon must not hide the search result. */ }
  }
  candidates.push(file);
  for (const source of new Set(candidates)) {
    try {
      const expanded = source.replace(/%([^%]+)%/g, (whole, name: string) => process.env[name] || whole);
      const icon = /\.(png|jpe?g|bmp)$/i.test(expanded)
        ? nativeImage.createFromPath(expanded)
        : await app.getFileIcon(expanded, { size: 'normal' });
      if (!icon.isEmpty()) return icon.toDataURL();
    } catch { /* Try the next resource. */ }
  }
  return '';
}
