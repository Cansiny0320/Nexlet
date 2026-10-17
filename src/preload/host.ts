import { localeBridge } from './locale';
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { createHostCall } from './host-client';
import type { SearchProgress } from '../shared/launch';
const channel = new MessageChannel();
const call = createHostCall(channel.port1);
ipcRenderer.postMessage('host-rpc:connect', null, [channel.port2]);
window.addEventListener('unload', () => channel.port1.close(), { once: true });
contextBridge.exposeInMainWorld(
  'nexlet',
  Object.freeze({
    pathForFile: (file: File) => webUtils.getPathForFile(file),
    call,
    onChange: (callback: (event: string) => void) => {
      const listener = (_event: unknown, event: string) => callback(event);
      ipcRenderer.on('host-change', listener);
      return () => ipcRenderer.removeListener('host-change', listener);
    },
    onSearchProgress: (callback: (event: SearchProgress) => void) => {
      const listener = (_event: unknown, event: SearchProgress) => callback(event);
      ipcRenderer.on('search-progress', listener);
      return () => ipcRenderer.removeListener('search-progress', listener);
    },
  }),
);

contextBridge.exposeInMainWorld('appLanguage', localeBridge);
