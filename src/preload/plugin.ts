import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('nexlet', Object.freeze({
  info: () => ipcRenderer.invoke('plugin-api','info'),
  storage: Object.freeze({ get:(key:string)=>ipcRenderer.invoke('plugin-api','storage.get',{key}), set:(key:string,value:unknown)=>ipcRenderer.invoke('plugin-api','storage.set',{key,value}) }),
  clipboard: Object.freeze({ readText:()=>ipcRenderer.invoke('plugin-api','clipboard.readText'), writeText:(text:string)=>ipcRenderer.invoke('plugin-api','clipboard.writeText',text) }),
  openExternal:(url:string)=>ipcRenderer.invoke('plugin-api','openExternal',url),
  onActivate:(callback:(value:unknown)=>void)=>{ const listener=(_event:unknown,value:unknown)=>callback(value); ipcRenderer.on('plugin-activate',listener); return()=>ipcRenderer.removeListener('plugin-activate',listener); }
}));
