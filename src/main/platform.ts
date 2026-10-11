import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { systemPreferences } from 'electron';
import koffi from 'koffi';

const exec = promisify(execFile);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
interface PasteTarget { handle?: number | bigint; pid: number; }

/** System integration is kept in the trusted host, never exposed as arbitrary native calls. */
export class Platform {
  status: string | null = null;
  target: PasteTarget | null = null;
  private win: Record<string, (...args: any[]) => any> | null = null;
  constructor(private ownerHandle: () => Buffer | undefined) {
    if (process.platform === 'win32') {
      try {
        const user = koffi.load('user32.dll'), shell = koffi.load('shell32.dll'), kernel = koffi.load('kernel32.dll'), crt = koffi.load('msvcrt.dll');
        this.win = {
          foreground: user.func('uintptr_t __stdcall GetForegroundWindow()'),
          getPid: user.func('uint32_t __stdcall GetWindowThreadProcessId(uintptr_t hwnd, _Out_ uint32_t *pid)'),
          isWindow: user.func('bool __stdcall IsWindow(uintptr_t hwnd)'),
          focus: user.func('bool __stdcall SetForegroundWindow(uintptr_t hwnd)'),
          minimized: user.func('bool __stdcall IsIconic(uintptr_t hwnd)'),
          show: user.func('bool __stdcall ShowWindow(uintptr_t hwnd, int command)'),
          key: user.func('void __stdcall keybd_event(uint8_t key, uint8_t scan, uint32_t flags, uintptr_t extra)'),
          keyState: user.func('int16_t __stdcall GetAsyncKeyState(int key)'),
          sequence: user.func('uint32_t __stdcall GetClipboardSequenceNumber()'),
          open: user.func('bool __stdcall OpenClipboard(uintptr_t hwnd)'),
          close: user.func('bool __stdcall CloseClipboard()'),
          empty: user.func('bool __stdcall EmptyClipboard()'),
          getData: user.func('uintptr_t __stdcall GetClipboardData(uint32_t format)'),
          setData: user.func('uintptr_t __stdcall SetClipboardData(uint32_t format, uintptr_t memory)'),
          queryFile: shell.func('uint32_t __stdcall DragQueryFileW(uintptr_t drop, uint32_t index, _Out_ uint8_t *buffer, uint32_t size)'),
          alloc: kernel.func('uintptr_t __stdcall GlobalAlloc(uint32_t flags, size_t bytes)'),
          lock: kernel.func('void * __stdcall GlobalLock(uintptr_t memory)'),
          unlock: kernel.func('bool __stdcall GlobalUnlock(uintptr_t memory)'),
          free: kernel.func('uintptr_t __stdcall GlobalFree(uintptr_t memory)'),
          copy: crt.func('void *memcpy(void *destination, const void *source, size_t bytes)')
        };
      } catch (error) { this.status = `Windows 系统桥接未就绪：${(error as Error).message}`; }
    } else if (process.platform !== 'darwin') this.status = 'Linux 当前提供基础界面；文件剪贴板和自动回贴尚未支持';
  }
  sequence(): number | null { return this.win ? this.win.sequence() : null; }
  async rememberTarget(): Promise<void> {
    if (this.win) {
      const handle = this.win.foreground(); const pid = [0]; this.win.getPid(handle, pid);
      if (pid[0] && pid[0] !== process.pid) this.target = { handle, pid: pid[0] };
    } else if (process.platform === 'darwin') {
      try {
        const result = await this.jxa('ObjC.import("AppKit"); var app=$.NSWorkspace.sharedWorkspace.frontmostApplication; JSON.stringify({pid:Number(app.processIdentifier)});');
        const target = JSON.parse(result) as PasteTarget;
        if (target.pid && target.pid !== process.pid) this.target = target;
      } catch { this.target = null; }
    }
  }
  async readFiles(): Promise<string[]> {
    if (this.win) {
      if (!this.win.open(0)) return [];
      try {
        const drop = this.win.getData(15); if (!drop) return [];
        const count = this.win.queryFile(drop, 0xffffffff, null, 0);
        if (count > 256) return [];
        const result: string[] = [];
        for (let i = 0; i < count; i++) {
          const length = this.win.queryFile(drop, i, null, 0); if (!length || length > 32767) continue;
          const buffer = Buffer.alloc((length + 1) * 2); this.win.queryFile(drop, i, buffer, length + 1);
          result.push(buffer.toString('utf16le', 0, length * 2));
        }
        return result;
      } finally { this.win.close(); }
    }
    if (process.platform === 'darwin') {
      const output = await this.jxa('ObjC.import("AppKit"); var urls=$.NSPasteboard.generalPasteboard.readObjectsForClassesOptions([$.NSURL],null); var out=[]; if(urls) for(var i=0;i<Number(urls.count);i++){var u=urls.objectAtIndex(i);if(u.isFileURL)out.push(ObjC.unwrap(u.path));} JSON.stringify(out);');
      return JSON.parse(output || '[]');
    }
    return [];
  }
  async writeFiles(files: string[]): Promise<void> {
    if (this.win) {
      const list = Buffer.from(files.join('\0') + '\0\0', 'utf16le');
      const data = Buffer.alloc(20 + list.length); data.writeUInt32LE(20, 0); data.writeUInt32LE(1, 16); list.copy(data, 20);
      const memory = this.win.alloc(0x42, data.length); if (!memory) throw new Error('无法分配剪贴板内存');
      let owned = true;
      try {
        const pointer = this.win.lock(memory); if (!pointer) throw new Error('无法访问剪贴板内存');
        this.win.copy(pointer, data, data.length); this.win.unlock(memory);
        const handle = this.ownerHandle(); const owner = handle ? (handle.length >= 8 ? handle.readBigUInt64LE() : handle.readUInt32LE()) : 0;
        if (!owner || !this.win.open(owner)) throw new Error('剪贴板正在被其他应用占用，请重试');
        try { if (!this.win.empty() || !this.win.setData(15, memory)) throw new Error('无法写入文件剪贴板'); owned = false; }
        finally { this.win.close(); }
      } finally { if (owned) this.win.free(memory); }
      return;
    }
    if (process.platform === 'darwin') {
      await this.jxa('ObjC.import("AppKit"); function run(argv){var paths=JSON.parse(argv[0]);var urls=paths.map(function(p){return $.NSURL.fileURLWithPath(p);});var pb=$.NSPasteboard.generalPasteboard;pb.clearContents;if(!pb.writeObjects(urls))throw Error("无法写入文件剪贴板");}', [JSON.stringify(files)]); return;
    }
    throw new Error('此平台暂不支持复制文件');
  }
  async paste(): Promise<void> {
    const target = this.target;
    if (!target) throw new Error('没有可回贴的目标窗口，请先复制后手动粘贴，或从目标应用使用快捷键唤起 Nexlet');
    if (this.win && target.handle) {
      if (!this.win.isWindow(target.handle)) throw new Error('原窗口已关闭，请重新从目标应用唤起');
      const pid = [0]; this.win.getPid(target.handle, pid);
      if (pid[0] !== target.pid) throw new Error('原窗口已变化，请重新唤起');
      if (this.win.minimized(target.handle)) this.win.show(target.handle, 9);
      this.win.focus(target.handle); await sleep(120);
      if (this.win.foreground() !== target.handle) throw new Error('无法恢复原窗口焦点，内容已复制，请手动粘贴');
      for (let attempt = 0; attempt < 20 && [0x11, 0x12, 0x10].some(key => (this.win!.keyState(key) & 0x8000) !== 0); attempt++) await sleep(25);
      if ([0x11, 0x12, 0x10].some(key => (this.win!.keyState(key) & 0x8000) !== 0)) throw new Error('请松开快捷键后重试');
      this.win.key(0x11, 0, 0, 0); this.win.key(0x56, 0, 0, 0); this.win.key(0x56, 0, 2, 0); this.win.key(0x11, 0, 2, 0);
      return;
    }
    if (process.platform === 'darwin') {
      if (!systemPreferences.isTrustedAccessibilityClient(false)) throw new Error('自动回贴需要 macOS 辅助功能权限；内容已复制，可手动粘贴');
      await this.jxa('ObjC.import("AppKit"); function run(argv){var target=$.NSRunningApplication.runningApplicationWithProcessIdentifier(Number(argv[0]));if(!target)throw Error("原应用已关闭");target.activateWithOptions(2);}', [String(target.pid)]);
      await sleep(150);
      const current = await this.jxa('ObjC.import("AppKit"); String($.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier);');
      if (Number(current) !== target.pid) throw new Error('无法恢复原应用焦点，内容已复制');
      await exec('/usr/bin/osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down'], { timeout: 5000 }); return;
    }
    throw new Error(this.status || '当前平台不支持自动回贴');
  }
  private async jxa(code: string, args: string[] = []): Promise<string> {
    const { stdout } = await exec('/usr/bin/osascript', ['-l','JavaScript','-e',code,...args], { timeout: 5000, maxBuffer: 1024 * 1024 }); return stdout.trim();
  }
}
