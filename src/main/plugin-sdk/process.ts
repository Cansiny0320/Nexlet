import { t } from '../../shared/i18n';
import { spawn } from 'node:child_process';
export interface ProcessRequest { executable: string; args?: string[]; cwd?: string; env?: Record<string, string>; stdin?: string; }
export function runProcess(request: ProcessRequest, signal: AbortSignal, progress: (event: { stream: 'stdout' | 'stderr'; text: string }) => void = () => {}): Promise<{ code: number; stdout: string; stderr: string }> {
  if (typeof request.executable !== 'string' || !request.executable || request.executable.length > 4096 || request.executable.includes('\0') || (request.args !== undefined && (!Array.isArray(request.args) || request.args.length > 1000 || request.args.some(arg => typeof arg !== 'string' || arg.length > 32768 || arg.includes('\0'))))) throw new Error(t("进程参数无效"));
  if (request.stdin !== undefined && (typeof request.stdin !== 'string' || Buffer.byteLength(request.stdin) > 8 * 1024 * 1024)) throw new Error(t("stdin 超过限制"));
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(request.executable, request.args ?? [], { cwd: request.cwd, env: request.env ? { ...process.env, ...request.env } : process.env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', bytes = 0, failure: Error | undefined;
    const kill = () => {
      if (process.platform !== 'win32' && child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
      else if (child.pid) { const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); killer.on('error', () => child.kill()); }
    };
    const abort = () => { failure = signal.reason instanceof Error ? signal.reason : new Error(t("进程已取消")); kill(); };
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    const consume = (stream: 'stdout' | 'stderr', text: string) => {
      bytes += Buffer.byteLength(text);
      if (bytes > 8 * 1024 * 1024) { failure = new Error(t("进程输出超过 8 MB")); kill(); return; }
      if (stream === 'stdout') stdout += text; else stderr += text;
      progress({ stream, text });
    };
    child.stdout.on('data', text => consume('stdout', text)); child.stderr.on('data', text => consume('stderr', text));
    child.on('error', error => { failure = error; });
    child.on('close', code => { signal.removeEventListener('abort', abort); if (failure) reject(failure); else resolve({ code: code ?? -1, stdout, stderr }); });
    child.stdin.on('error', () => {}); child.stdin.end(request.stdin);
  });
}
