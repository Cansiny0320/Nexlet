import { execFile } from 'node:child_process';
import { release } from 'node:os';
import { promisify } from 'node:util';
import { systemCommands } from './system-commands';

const exec = promisify(execFile);
// Resolve installed extensions by bundle ID: filenames vary between macOS
// versions. Read resources only; never load or execute extension code.
const script = `ObjC.import('AppKit');
function run(argv) {
  var requested = JSON.parse(argv[0]), bundles = {}, root = '/System/Library/ExtensionKit/Extensions';
  var files = ObjC.unwrap($.NSFileManager.defaultManager.contentsOfDirectoryAtPathError(root, null));
  files.forEach(function(name) {
    try {
      var file = root + '/' + ObjC.unwrap(name), bundle = $.NSBundle.bundleWithPath(file);
      var id = ObjC.unwrap(bundle.bundleIdentifier);
      if (requested.some(function(entry) { return entry[1] === id; })) bundles[id] = [file, bundle];
    } catch (_) {}
  });
  return JSON.stringify(requested.map(function(entry) {
    try {
      var match = bundles[entry[1]];
      if (!match) return [entry[0], ''];
      var bundle = match[1], info = ObjC.deepUnwrap(bundle.infoDictionary), image;
      var attributes = (info.EXAppExtensionAttributes || {}).SettingsExtensionAttributes || {};
      var battery = (attributes.representations || []).find(function(item) { return item['sidebar-iconUTTypeIdentifier'] === 'com.apple.graphic-icon.battery'; });
      if (battery) {
        // The power extension's icon.icns is generic; its sidebar declares
        // the actual system battery icon by UTI. This API works in JXA.
        image = $.NSWorkspace.sharedWorkspace.iconForFileType(battery['sidebar-iconUTTypeIdentifier']);
      } else if (info.CFBundleIcons && info.CFBundleIcons.ISGraphicIconConfiguration) {
        image = $.NSWorkspace.sharedWorkspace.iconForFile(match[0]);
      } else {
        var name = info.CFBundleIconName || info.CFBundleIconFile;
        if (!name) return [entry[0], ''];
        image = bundle.imageForResource(name);
      }
      if (!image || !image.isValid) return [entry[0], ''];
      var small = $.NSImage.alloc.initWithSize($.NSMakeSize(64, 64));
      small.lockFocus;
      try { image.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, 64, 64), $.NSZeroRect, $.NSCompositingOperationCopy, 1); }
      finally { small.unlockFocus; }
      var data = $.NSBitmapImageRep.imageRepWithData(small.TIFFRepresentation).representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary);
      return [entry[0], 'data:image/png;base64,' + ObjC.unwrap(data.base64EncodedStringWithOptions(0))];
    } catch (_) { return [entry[0], '']; }
  }));
}`;

export async function loadMacSystemIcons(): Promise<Map<string, string>> {
  const entries = systemCommands(process.platform, release())
    .filter(c => c.url?.startsWith('x-apple.systempreferences:'))
    .map(c => [c.id, c.url!.slice('x-apple.systempreferences:'.length)]);
  if (!entries.length) return new Map();
  try {
    const { stdout } = await exec('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, JSON.stringify(entries)], { timeout: 10000, maxBuffer: 8 * 1024 * 1024 });
    const known = new Set(entries.map(([id]) => id));
    return new Map((JSON.parse(stdout) as [string, string][]).filter(([id, icon]) => known.has(id) && icon.startsWith('data:image/png;base64,')));
  } catch { return new Map(); } // Keep semantic fallback icons on older/unavailable resources.
}
