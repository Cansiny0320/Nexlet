import {contextBridge,ipcRenderer} from 'electron';
import type {OcrMessage} from '../shared/ocr';
window.addEventListener('error',event=>ipcRenderer.send('ocr-report',{type:'error',error:event.message||'识别脚本加载失败'}));
window.addEventListener('unhandledrejection',event=>ipcRenderer.send('ocr-report',{type:'error',error:String(event.reason)}));
contextBridge.exposeInMainWorld('ocrEngine',Object.freeze({
 start:(callback:(image:Uint8Array)=>void)=>{ipcRenderer.once('ocr-image',(_event,image:Uint8Array)=>callback(image));ipcRenderer.send('ocr-ready');},
 report:(message:OcrMessage)=>ipcRenderer.send('ocr-report',message)
}));
