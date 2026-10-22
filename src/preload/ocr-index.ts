import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('ocrIndex', {
  listen(callback: (bytes: Uint8Array) => void) {
    ipcRenderer.on('ocr-index:run', (_event, bytes: Uint8Array) => callback(bytes));
    ipcRenderer.send('ocr-index:ready');
  },
  progress(value: number) {
    ipcRenderer.send('ocr-index:progress', value);
  },
  finish(value: { text?: string; error?: string }) {
    ipcRenderer.send('ocr-index:result', value);
  },
});
