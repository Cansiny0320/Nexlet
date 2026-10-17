import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
vi.mock('electron', () => ({ systemPreferences: {} }));
import { Platform } from '../src/main/platform';
const exec = promisify(execFile);

describe.skipIf(process.platform !== 'darwin')(
  'macOS 原生文件剪贴板（独立命名 pasteboard）',
  () => {
    let platform: Platform, board: string, folder: string, files: string[];
    const jxa = async (code: string, ...args: string[]) =>
      exec('/usr/bin/osascript', ['-l', 'JavaScript', '-e', code, ...args], { timeout: 5000 });
    beforeEach(async () => {
      board = 'nexlet-test-' + randomUUID();
      folder = await mkdtemp(path.join(tmpdir(), 'nexlet-pasteboard-'));
      files = [
        path.join(folder, '中文 空格 # % "引号".txt'),
        path.join(folder, 'line\nbreak.json'),
        path.join(folder, '目录'),
      ];
      await writeFile(files[0], 'one');
      await writeFile(files[1], 'two');
      await mkdir(files[2]);
      platform = new Platform(() => undefined);
      // Keep the production scripts and real osascript/AppKit bridge; replace only
      // the pasteboard destination so these tests never touch the user's clipboard.
      const invoke = (platform as any).jxa.bind(platform);
      (platform as any).jxa = (code: string, args: string[] = []) =>
        invoke(
          code.replaceAll(
            '$.NSPasteboard.generalPasteboard',
            `$.NSPasteboard.pasteboardWithName(${JSON.stringify(board)})`,
          ),
          args,
        );
    });
    afterEach(async () => {
      await jxa(
        'ObjC.import("AppKit"); function run(argv){$.NSPasteboard.pasteboardWithName(argv[0]).releaseGlobally;}',
        board,
      );
      await rm(folder, { recursive: true, force: true });
    });
    it('跨 osascript 进程保留多个文件、目录与特殊字符路径', async () => {
      await platform.writeFiles(files);
      expect(await platform.readFiles()).toEqual(files);
      const { stdout, stderr } = await jxa(
        'ObjC.import("AppKit"); function run(argv){var p=$.NSPasteboard.pasteboardWithName(argv[0]);return JSON.stringify({count:Number(p.pasteboardItems.count),types:ObjC.deepUnwrap(p.types)});}',
        board,
      );
      expect(stderr).toBe('');
      expect(JSON.parse(stdout)).toMatchObject({
        count: 3,
        types: expect.arrayContaining(['public.file-url']),
      });
    });
    it('读取其他原生写入者的文件列表；文本、网页 URL 与空内容返回空列表', async () => {
      await jxa(
        'ObjC.import("AppKit"); function run(argv){var p=$.NSPasteboard.pasteboardWithName(argv[0]);p.clearContents;p.writeObjects($.NSArray.arrayWithObject($.NSURL.fileURLWithPath(argv[1])));}',
        board,
        files[0],
      );
      expect(await platform.readFiles()).toEqual([files[0]]);
      for (const script of [
        '',
        'p.setStringForType("plain text",$.NSPasteboardTypeString);',
        'p.writeObjects($.NSArray.arrayWithObject($.NSURL.URLWithString("https://example.com")));',
      ]) {
        await jxa(
          `ObjC.import("AppKit"); function run(argv){var p=$.NSPasteboard.pasteboardWithName(argv[0]);p.clearContents;${script}}`,
          board,
        );
        expect(await platform.readFiles()).toEqual([]);
      }
    });
  },
);
