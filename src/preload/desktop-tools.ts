import { localeBridge } from './locale';
import { contextBridge, ipcRenderer } from 'electron';
const actions = ['state', 'cancel', 'complete', 'copy', 'save', 'launch', 'pin', 'rotate', 'zoom'];
contextBridge.exposeInMainWorld(
  'desktopTools',
  Object.freeze({
    call: (action: string, payload?: unknown) =>
      actions.includes(action)
        ? ipcRenderer.invoke('desktop-tools', action, payload)
        : Promise.reject(Error('不支持的操作')),
    onChange: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('desktop-change', listener);
      return () => ipcRenderer.removeListener('desktop-change', listener);
    },
  }),
);

contextBridge.exposeInMainWorld('appLanguage', localeBridge);
