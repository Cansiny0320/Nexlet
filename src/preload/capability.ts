import { t } from '../shared/i18n';
import { contextBridge, ipcRenderer } from 'electron';
const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
let sequence = 0;
ipcRenderer.on('capability:reply', (_event, value) => {
  const request = pending.get(value.id);
  if (!request) return;
  pending.delete(value.id);
  if (value.error) request.reject(new Error(value.error));
  else request.resolve(value.result);
});
contextBridge.exposeInMainWorld('nexletProvider', {
  listen(callback: (value: unknown) => void) {
    ipcRenderer.once('capability:run', (_event, value) => callback(value));
    ipcRenderer.send('capability:ready');
  },
  progress(value: number) {
    ipcRenderer.send('capability:progress', value);
  },
  finish(value: unknown) {
    ipcRenderer.send('capability:result', value);
  },
  fail(message: string) {
    ipcRenderer.send('capability:error', message);
  },
  call(method: 'network' | 'ai', args: unknown) {
    if (pending.size >= 4) return Promise.reject(new Error(t('提供商并发请求过多')));
    const id = 'call-' + ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ipcRenderer.send('capability:call', { id, method, args });
    });
  },
});
