import {BrowserWindow,ipcMain,net,session,type IpcMainEvent,type Session} from 'electron';
import {EventEmitter} from 'node:events';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {OCR_ENGINE_URL} from '../shared/ocr';
import {ocrAssetPath} from './ocr-assets';
import type {OcrJobWorker} from './ocr';

// A private, non-persistent session serves only packaged resources. It cannot access the network.
export function createOcrWorkerFactory(models:string,renderer:string):(image:Buffer)=>OcrJobWorker{
 let isolated:Session|undefined;
 return image=>{
  if(!isolated){
   isolated=session.fromPartition('nexlet-ocr',{cache:false});
   isolated.setPermissionRequestHandler((_contents,_permission,respond)=>respond(false));
   isolated.setPermissionCheckHandler(()=>false);
   isolated.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!ocrAssetPath(details.url,renderer,models)}));
   isolated.protocol.handle('nexlet-ocr',request=>{
    const file=ocrAssetPath(request.url,renderer,models);
    return file?net.fetch(pathToFileURL(file).href):new Response('Not found',{status:404});
   });
  }
  const events=new EventEmitter(),window=new BrowserWindow({show:false,skipTaskbar:true,webPreferences:{session:isolated,preload:path.join(__dirname,'../preload/ocr.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,spellcheck:false}});
  const contents=window.webContents;let ended=false;
  const authorized=(event:IpcMainEvent)=>!ended&&event.sender===contents&&event.senderFrame===contents.mainFrame&&event.senderFrame.url===OCR_ENGINE_URL;
  const ready=(event:IpcMainEvent)=>{if(authorized(event))contents.send('ocr-image',image);};
  const report=(event:IpcMainEvent,message:unknown)=>{if(authorized(event))events.emit('message',message);};
  const cleanup=()=>{ipcMain.removeListener('ocr-ready',ready);ipcMain.removeListener('ocr-report',report);};
  ipcMain.on('ocr-ready',ready);ipcMain.on('ocr-report',report);
  contents.setWindowOpenHandler(()=>({action:'deny'}));
  contents.on('will-navigate',event=>event.preventDefault());
  contents.on('will-attach-webview',event=>event.preventDefault());
  contents.on('render-process-gone',(_event,details)=>{if(!ended)events.emit('error',Error(details.reason));});
  window.on('closed',()=>{cleanup();if(!ended){ended=true;events.emit('exit');}});
  void window.loadURL(OCR_ENGINE_URL).catch(error=>{if(!ended)events.emit('error',error);});
  return Object.assign(events,{terminate(){if(ended)return;ended=true;cleanup();if(!window.isDestroyed())window.destroy();}});
 };
}
