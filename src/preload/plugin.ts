import { contextBridge, ipcRenderer } from 'electron';
import { sdk, invoke, inputExtensions, clipboardExtensions } from './plugin-sdk';
type Callback=(value:unknown)=>unknown;
const callbacks=new Map<string,Set<Callback>>(),latest=new Map<string,unknown>();
const subscribe=(event:string,callback:Callback)=>{
  if(typeof callback!=='function')throw new Error('事件回调无效');
  let listeners=callbacks.get(event);if(!listeners){listeners=new Set();callbacks.set(event,listeners);}listeners.add(callback);
  if((event==='ready'||event==='enter')&&latest.has(event))queueMicrotask(()=>{if(listeners!.has(callback))void Promise.resolve().then(()=>callback(latest.get(event))).catch(()=>{});});
  return()=>listeners!.delete(callback);
};
ipcRenderer.on('plugin-lifecycle',(_event,{event,value,sequence})=>{
  if(event==='ready'||event==='enter')latest.set(event,value);
  if(event==='out')latest.delete('enter');
  void Promise.allSettled([...(callbacks.get(event)||[])].map(callback=>Promise.resolve().then(()=>callback(value)))).finally(()=>ipcRenderer.invoke('plugin-api','lifecycleAck',sequence).catch(()=>{}));
});
window.addEventListener('DOMContentLoaded',()=>{void ipcRenderer.invoke('plugin-api','ready').catch(()=>{});},{once:true});
contextBridge.exposeInMainWorld('nexlet', Object.freeze({
  ...sdk,
  info: () => ipcRenderer.invoke('plugin-api','info'),
  context: () => ipcRenderer.invoke('plugin-api','context'),
  input: Object.freeze({ ...inputExtensions, read:(id:string)=>ipcRenderer.invoke('plugin-api','input.read',id) }),
  onReady:(callback:Callback)=>subscribe('ready',callback),
  onEnter:(callback:Callback)=>subscribe('enter',callback),
  onOut:(callback:Callback)=>subscribe('out',callback),
  onDetach:(callback:Callback)=>subscribe('detach',callback),
  storage: Object.freeze({ get:(key:string)=>ipcRenderer.invoke('plugin-api','storage.get',{key}), set:(key:string,value:unknown)=>ipcRenderer.invoke('plugin-api','storage.set',{key,value}), keys:()=>invoke('storage.keys'), remove:(key:string)=>invoke('storage.remove',key) }),
  network: Object.freeze({ request:(request:unknown)=>ipcRenderer.invoke('plugin-api','network.request',request), cancel:(id:string)=>ipcRenderer.invoke('plugin-api','network.cancel',id), resetPermissions:()=>ipcRenderer.invoke('plugin-api','network.resetPermissions') }),
  secrets: Object.freeze({ get:(key:string)=>ipcRenderer.invoke('plugin-api','secrets.get',{key}), set:(key:string,value:string|null)=>ipcRenderer.invoke('plugin-api','secrets.set',{key,value}) }),
  clipboard: Object.freeze({ ...clipboardExtensions, readText:()=>ipcRenderer.invoke('plugin-api','clipboard.readText'), writeText:(text:string)=>ipcRenderer.invoke('plugin-api','clipboard.writeText',text) }),
  openExternal:(url:string)=>ipcRenderer.invoke('plugin-api','openExternal',url),
  onActivate:(callback:(value:unknown)=>void)=>{ const listener=(_event:unknown,value:unknown)=>callback(value); ipcRenderer.on('plugin-activate',listener); return()=>ipcRenderer.removeListener('plugin-activate',listener); }
}));
