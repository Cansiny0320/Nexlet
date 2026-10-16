import { localeBridge } from './locale';
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { HOST_ACTIONS, type HostAction } from '../shared/types';
import type { SearchProgress } from '../shared/launch';
contextBridge.exposeInMainWorld('nexlet', Object.freeze({
  pathForFile:(file:File)=>webUtils.getPathForFile(file),
  call:(action:HostAction,payload?:unknown)=>{if(!HOST_ACTIONS.includes(action))return Promise.reject(new Error('不支持的操作'));return ipcRenderer.invoke('host-api',action,payload);},
  onChange:(callback:(event:string)=>void)=>{const listener=(_event:unknown,event:string)=>callback(event);ipcRenderer.on('host-change',listener);return()=>ipcRenderer.removeListener('host-change',listener);},
  onSearchProgress:(callback:(event:SearchProgress)=>void)=>{const listener=(_event:unknown,event:SearchProgress)=>callback(event);ipcRenderer.on('search-progress',listener);return()=>ipcRenderer.removeListener('search-progress',listener);}
}));

contextBridge.exposeInMainWorld('appLanguage', localeBridge);
