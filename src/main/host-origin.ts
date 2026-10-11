import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { realpathSync } from 'node:fs';

// Windows portable extraction may expose an 8.3 path in Chromium and a long
// path in __dirname. Compare canonical files, never a URL prefix.
export function isHostDocument(url: string, document: string, canonical: (file: string) => string = realpathSync, platform = process.platform): boolean {
  try {
    const source = new URL(url);
    if (source.protocol !== 'file:' || source.host) return false;
    source.search = ''; source.hash = '';
    const normalize = (file: string) => { const resolved = canonical(path.resolve(file)); return platform === 'win32' ? resolved.toLowerCase() : resolved; };
    return normalize(fileURLToPath(source)) === normalize(document);
  } catch { return false; }
}
