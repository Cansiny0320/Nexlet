import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

// Finder's display name includes the user's current localization. Keep paths
// separate from code so quotes/non-ASCII names remain ordinary input data.
export async function loadMacCatalogNames(files: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(files)];
  const code = `ObjC.import('Foundation');
function run(argv) {
  return JSON.stringify(JSON.parse(argv[0]).map(function(file) {
    try { return [file, ObjC.unwrap($.NSFileManager.defaultManager.displayNameAtPath(file))]; }
    catch (_) { return [file, '']; }
  }));
}`;
  for (let offset = 0; offset < unique.length; offset += 128) {
    try {
      const { stdout } = await exec('/usr/bin/osascript', ['-l', 'JavaScript', '-e', code, JSON.stringify(unique.slice(offset, offset + 128))], { timeout: 10000, maxBuffer: 1024 * 1024 });
      for (const [file, value] of JSON.parse(stdout) as [string, string][]) {
        const name = value.trim().replace(/\.app$/i, '');
        if (name) names.set(file, name);
      }
    } catch { /* Preserve the filename for unavailable metadata/batches. */ }
  }
  return names;
}
// Electron may return the generic .app type icon on macOS. Ask NSWorkspace
// for each bundle's icon, rendering a small PNG before crossing the bridge.
const script = `ObjC.import('AppKit');
function run(argv) {
  return JSON.stringify(JSON.parse(argv[0]).map(function(file) {
    try {
      var image = $.NSWorkspace.sharedWorkspace.iconForFile(file);
      var small = $.NSImage.alloc.initWithSize($.NSMakeSize(64, 64));
      small.lockFocus;
      try { image.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, 64, 64), $.NSZeroRect, $.NSCompositingOperationCopy, 1); }
      finally { small.unlockFocus; }
      var data = $.NSBitmapImageRep.imageRepWithData(small.TIFFRepresentation).representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary);
      return [file, 'data:image/png;base64,' + ObjC.unwrap(data.base64EncodedStringWithOptions(0))];
    } catch (_) { return [file, '']; }
  }));
}`;

export async function loadMacCatalogIcons(files: string[]): Promise<Map<string, string>> {
  const icons = new Map<string, string>();
  const unique = [...new Set(files)];
  for (let offset = 0; offset < unique.length; offset += 64) {
    try {
      const { stdout } = await exec('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, JSON.stringify(unique.slice(offset, offset + 64))], { timeout: 10000, maxBuffer: 8 * 1024 * 1024 });
      for (const [file, icon] of JSON.parse(stdout) as [string, string][]) {
        if (icon) icons.set(file, icon);
      }
    } catch { /* The caller retains Electron's file-icon fallback. */ }
  }
  return icons;
}
