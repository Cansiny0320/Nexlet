import { t } from '../shared/i18n';
import koffi from 'koffi';

function loadShell() {
  const shell = koffi.load('shell32.dll');
  const ole = koffi.load('ole32.dll');
  const kernel = koffi.load('kernel32.dll');
  const info = koffi.struct({
    cbSize: 'uint32_t', fMask: 'uint32_t', hwnd: 'void *',
    lpVerb: 'str16', lpFile: 'str16', lpParameters: 'str16', lpDirectory: 'str16',
    nShow: 'int32_t', hInstApp: 'void *', lpIDList: 'void *', lpClass: 'str16',
    hkeyClass: 'void *', dwHotKey: 'uint32_t', hIcon: 'void *', hProcess: 'void *'
  });
  return {
    size: koffi.sizeof(info),
    execute: shell.func('__stdcall', 'ShellExecuteExW', 'int32_t', [koffi.inout(koffi.pointer(info))]),
    initialize: ole.func('int32_t __stdcall CoInitializeEx(void *, uint32_t)'),
    uninitialize: ole.func('void __stdcall CoUninitialize()'),
    lastError: kernel.func('uint32_t __stdcall GetLastError()')
  };
}

// Load Windows DLLs only on demand so importing the host remains portable.
let native: ReturnType<typeof loadShell> | undefined;

export function launchWindowsApplication(appId: string): void {
  if (!/^[a-zA-Z0-9_.-]+![a-zA-Z0-9_.-]+$/.test(appId)) throw new Error(t("Windows 应用标识无效"));
  const shell = native ??= loadShell();
  // STA + disable OLE1 DDE. An existing different apartment may still use the Shell.
  const initialized = shell.initialize(null, 0x6) as number;
  if (initialized < 0 && (initialized >>> 0) !== 0x80010106) {
    throw new Error(t("无法初始化 Windows 应用启动服务（HRESULT 0x{{v0}}）", { v0: (initialized >>> 0).toString(16) }));
  }
  try {
    // Explorer's process exit code does not describe application activation success.
    // Ask the Shell directly; NO_UI leaves failures to Nexlet's error toast.
    const accepted = shell.execute({
      cbSize: shell.size, fMask: 0x100 | 0x400, hwnd: null,
      lpVerb: 'open', lpFile: 'shell:AppsFolder\\' + appId,
      lpParameters: null, lpDirectory: null, nShow: 1,
      hInstApp: null, lpIDList: null, lpClass: null, hkeyClass: null,
      dwHotKey: 0, hIcon: null, hProcess: null
    });
    if (!accepted) {
      const code = shell.lastError() as number;
      const reason = code === 2 || code === 3 ? t("应用不存在或已卸载，请刷新应用列表")
        : code === 5 ? t("系统拒绝访问该应用")
        : code === 1223 ? t("启动已取消") : t("系统未能启动该应用");
      throw new Error(t("无法启动应用：{{v0}}（Windows 错误 {{v1}}）", { v0: reason, v1: code }));
    }
  } finally {
    // S_OK and S_FALSE both increment COM's per-thread initialization count.
    if (initialized >= 0) shell.uninitialize();
  }
}
