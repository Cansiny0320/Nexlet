import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createSelectionPasteboard } from '../src/main/selection-pasteboard-mac';
const exec = promisify(execFile);
describe.skipIf(process.platform !== 'darwin')('原生剪贴板快照（独立命名 pasteboard）', () => {
  let name: string, board: ReturnType<typeof createSelectionPasteboard>;
  async function write(items: Record<string, string>[]) {
    await exec(
      '/usr/bin/osascript',
      [
        '-l',
        'JavaScript',
        '-e',
        'ObjC.import("AppKit");function run(argv){var b=$.NSPasteboard.pasteboardWithName(argv[0]),a=$.NSMutableArray.array;JSON.parse(argv[1]).forEach(function(values){var i=$.NSPasteboardItem.alloc.init;Object.keys(values).forEach(function(type){i.setDataForType($.NSData.alloc.initWithBase64EncodedStringOptions(values[type],0),type);});a.addObject(i);});b.clearContents;if(a.count)b.writeObjects(a);}',
        name,
        JSON.stringify(items),
      ],
      { timeout: 5000 },
    );
  }
  beforeEach(() => {
    name = 'nexlet-selection-' + randomUUID();
    board = createSelectionPasteboard(name);
  });
  afterEach(async () => {
    await exec('/usr/bin/osascript', [
      '-l',
      'JavaScript',
      '-e',
      'ObjC.import("AppKit");function run(argv){$.NSPasteboard.pasteboardWithName(argv[0]).releaseGlobally;}',
      name,
    ]);
  });
  it('restores HTML, binary custom formats and multiple items without byte conversion', async () => {
    const html = Buffer.from('<meta charset="utf-8"><b>中文 &amp; HTML</b>'),
      custom = Buffer.from([0, 255, 1, 0, 127]);
    await write([
      { 'public.html': html.toString('base64'), 'org.nexlet.raw-test': custom.toString('base64') },
      { 'public.file-url': Buffer.from('file:///tmp/second.txt').toString('base64') },
    ]);
    const before = board.snapshot();
    expect(before.data).toHaveLength(2);
    expect(before.data[0]['public.html']).toEqual(html);
    expect(before.data[0]['org.nexlet.raw-test']).toEqual(custom);
    await write([
      { 'public.utf8-plain-text': Buffer.from('temporary selection').toString('base64') },
    ]);
    expect(board.restore(before, board.sequence())).toBe(true);
    expect(board.snapshot()).toEqual(before);
  });
  it('does not overwrite a newer owner, and restores an originally empty pasteboard', async () => {
    await write([]);
    const empty = board.snapshot(),
      old = board.sequence();
    await write([{ 'public.utf8-plain-text': Buffer.from('external copy').toString('base64') }]);
    expect(board.restore(empty, old)).toBe(false);
    expect(board.snapshot().data).not.toEqual([]);
    expect(board.restore(empty, board.sequence())).toBe(true);
    expect(board.snapshot()).toEqual(empty);
  });
});
