import path from 'node:path';
import {OCR_MODELS} from '../shared/ocr';
export function ocrAssetPath(address:string,renderer:string,models:string):string|null{
 try{
  const url=new URL(address);
  if(url.protocol!=='nexlet-ocr:'||url.host!=='engine'||url.username||url.password||url.search||url.hash)return null;
  if(url.pathname==='/ocr.html')return path.join(renderer,'ocr.html');
  if(/^\/assets\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(js|css|wasm|mjs)$/.test(url.pathname))return path.join(renderer,url.pathname);
  if(/^\/runtime\/ort-wasm-simd-threaded\.(mjs|wasm)$/.test(url.pathname))return path.join(renderer,url.pathname);
  for(const file of OCR_MODELS)if(url.pathname==='/models/'+file)return path.join(models,file);
  return null;
 }catch{return null;}
}
