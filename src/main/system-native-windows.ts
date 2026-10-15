import { t } from '../shared/i18n';
import koffi from 'koffi';

function loadNative() {
  const user = koffi.load('user32.dll'), power = koffi.load('powrprof.dll');
  const kernel = koffi.load('kernel32.dll'), security = koffi.load('advapi32.dll');
  return {
    lock: user.func('int32_t __stdcall LockWorkStation()'),
    suspend: power.func('uint8_t __stdcall SetSuspendState(uint8_t, uint8_t, uint8_t)'),
    currentProcess: kernel.func('void * __stdcall GetCurrentProcess()'),
    closeHandle: kernel.func('int32_t __stdcall CloseHandle(void *)'),
    lastError: kernel.func('uint32_t __stdcall GetLastError()'),
    clearError: kernel.func('void __stdcall SetLastError(uint32_t)'),
    openToken: security.func('int32_t __stdcall OpenProcessToken(void *, uint32_t, _Out_ void **)'),
    lookupPrivilege: security.func('int32_t __stdcall LookupPrivilegeValueW(str16, str16, void *)'),
    adjustPrivileges: security.func('int32_t __stdcall AdjustTokenPrivileges(void *, int32_t, void *, uint32_t, void *, void *)')
  };
}
let native: ReturnType<typeof loadNative> | undefined;

export async function windowsPowerAction(action: 'lock' | 'sleep'): Promise<void> {
  if (process.platform !== 'win32') throw Error(t("此操作仅支持 Windows"));
  const api = native ??= loadNative();
  const failure = () => Error(t("Windows 系统操作失败（错误 {{v0}}）", { v0: api.lastError() }));
  if (action === 'lock') { if (!api.lock()) throw failure(); return; }
  // SetSuspendState requires SeShutdownPrivilege. Enable only the existing
  // token privilege, preserve its previous attributes, then restore and close.
  const token: unknown[] = [null];
  if (!api.openToken(api.currentProcess(), 0x20 | 0x8, token)) throw failure();
  let previous: Buffer | undefined;
  try {
    const privileges = Buffer.alloc(16); // DWORD count + LUID + DWORD attributes
    privileges.writeUInt32LE(1);
    if (!api.lookupPrivilege(null, 'SeShutdownPrivilege', privileges.subarray(4, 12))) throw failure();
    privileges.writeUInt32LE(2, 12); // SE_PRIVILEGE_ENABLED
    const saved = Buffer.alloc(16), size = Buffer.alloc(4);
    api.clearError(0);
    if (!api.adjustPrivileges(token[0], 0, privileges, saved.length, saved, size)) throw failure();
    // A nonzero return can still mean ERROR_NOT_ALL_ASSIGNED.
    const error = api.lastError() as number;
    previous = saved;
    if (error) throw Error(t("Windows 无法取得睡眠权限（错误 {{v0}}）", { v0: error }));
    await new Promise<void>((resolve, reject) => {
      // The call may finish only after wake. Don't block Electron's main thread.
      // GetLastError belongs to the worker thread, so don't read it on the JS thread.
      api.suspend.async(0, 0, 0, (error: Error | null, accepted: number) => {
        if (error) reject(error);
        else if (!accepted) reject(Error(t("Windows 未接受睡眠请求，请检查电源策略与睡眠支持")));
        else resolve();
      });
    });
  } finally {
    try {
      if (previous && !api.adjustPrivileges(token[0], 0, previous, 0, null, null)) throw failure();
    } finally { api.closeHandle(token[0]); }
  }
}
