import { localizeCommand } from '../shared/localized-command';
import { t } from '../shared/i18n';
import {BrowserWindow,clipboard,ClipboardItem,dialog,ipcMain,nativeImage,nativeTheme,screen,type NativeImage} from 'electron';
import {readFile,stat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {ScreenCapture} from './screen-capture';
import {OcrService} from './ocr';
import {createOcrWorkerFactory} from './ocr-runtime';
import {isHostDocument} from './host-origin';
import type {DesktopToolState,ImageToolState} from '../shared/desktop-tools';
import type {CaptureDestination} from '../shared/capture';
import type {WindowRect} from '../shared/window-layout';
import type {Command} from '../shared/types';
interface Session {window:BrowserWindow;state:DesktopToolState;image?:NativeImage;zoom:number;generation:number;}
interface Dependencies {launcher:(image:Buffer|string)=>Promise<void>;sequence:()=>number|null;theme:()=>string;enabled:(id:string)=>void;}
const destinations:CaptureDestination[]=['launcher','copy','save','pin','ocr','ocr-copy'];
export class DesktopTools {
 readonly capture:ScreenCapture;readonly ocr:OcrService;
 private sessions=new Map<number,Session>();private ocrSession:Session|null=null;private ocrOpening:Promise<Session>|null=null;
 constructor(private html:string,models:string,private deps:Dependencies){
  this.ocr=new OcrService(models,createOcrWorkerFactory(models,path.dirname(html)));
  this.capture=new ScreenCapture(async(state,bounds,preview)=>(await this.open({kind:'capture',...state},bounds,!preview)).window,w=>this.sessions.get(w.webContents.id)?.state.kind==='pin');
  ipcMain.handle('desktop-tools',async(event,action:unknown,payload:unknown)=>{const session=this.sessions.get(event.sender.id);if(!session||event.senderFrame!==event.sender.mainFrame||!isHostDocument(event.senderFrame.url,this.html))throw Error(t("不允许的调用来源"));return this.handle(session,action,payload);});
 }
 get busy(){return this.capture.busy;}
 private async open(state:DesktopToolState,bounds:WindowRect,overlay=false){
  const pin=state.kind==='pin',window=new BrowserWindow({...bounds,show:false,frame:false,resizable:state.kind==='ocr',minWidth:state.kind==='ocr'?620:undefined,minHeight:state.kind==='ocr'?420:undefined,alwaysOnTop:pin||overlay,skipTaskbar:state.kind!=='ocr',fullscreenable:false,enableLargerThanScreen:overlay||pin,backgroundColor:'#242528',title:'Nexlet · '+(pin?t("贴图"):state.kind==='ocr'?t("文字识别"):t("截图")),webPreferences:{preload:path.join(__dirname,'../preload/desktop-tools.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,spellcheck:false}});
  const owner=window.webContents.id,session:Session={window,state,zoom:1,generation:0};this.sessions.set(owner,session);
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());window.webContents.on('will-attach-webview',e=>e.preventDefault());
  window.on('closed',()=>{session.generation++;this.sessions.delete(owner);if(this.ocrSession===session){this.ocr.cancel();this.ocrSession=null;}});
  if(overlay||pin){window.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});window.setAlwaysOnTop(true,overlay?'screen-saver':'floating');}
  try{await window.loadFile(this.html,{query:{desktop:state.kind}});return session;}catch(error){window.destroy();throw error;}
 }
 private changed(s:Session){if(!s.window.isDestroyed())s.window.webContents.send('desktop-change');}
 private image(bytes:Buffer){if(bytes.length>20*1024*1024)throw Error(t("图片超过 20 MB"));const image=nativeImage.createFromBuffer(bytes),size=image.getSize();if(image.isEmpty()||size.width*size.height>36_000_000)throw Error(t("图片无效或超过 3600 万像素"));return image;}
 private base(kind:'pin'|'ocr',image?:NativeImage):ImageToolState{return {kind,image:image?.toDataURL(),text:'',phase:'idle',progress:0,theme:this.deps.theme()==='system'?(nativeTheme.shouldUseDarkColors?'dark':'light'):this.deps.theme()};}
 async screenshot(mode:'region'|'screen',destination:CaptureDestination='launcher'){
  await this.capture.start(mode,destination,async(image,to)=>{if(to==='pin')this.deps.enabled('image:pin');if(to==='ocr'||to==='ocr-copy')this.deps.enabled(to==='ocr-copy'?'ocr:image-copy':'tool:ocr');await this.output(image,to);});
 }
 private async output(bytes:Buffer,destination:CaptureDestination,owner?:BrowserWindow){
  const image=this.image(bytes);
  if(destination==='copy'){await clipboard.write([new ClipboardItem({'image/png':new Blob([new Uint8Array(image.toPNG())],{type:'image/png'})})]);return;}
  if(destination==='save'){const options={title:t("保存截图"),defaultPath:'Nexlet-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png',filters:[{name:t("PNG 图片"),extensions:['png']}]};const result=owner?await dialog.showSaveDialog(owner,options):await dialog.showSaveDialog(options);if(!result.canceled&&result.filePath)await writeFile(result.filePath,image.toPNG());return;}
  if(destination==='pin'){await this.pin(bytes);return;}
  if(destination==='ocr'||destination==='ocr-copy'){await this.openOcr(bytes,destination==='ocr-copy');return;}
  await this.deps.launcher(image.toPNG());
 }
 async pin(bytes:Buffer){
  this.deps.enabled('image:pin');const image=this.image(bytes),size=image.getSize(),area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,ratio=Math.min(1,(area.width-60)/size.width,(area.height-110)/size.height);
  const width=Math.max(320,Math.round(size.width*ratio)),height=Math.max(100,Math.round(size.height*ratio))+40;
  const s=await this.open(this.base('pin',image),{x:Math.round(area.x+(area.width-width)/2),y:Math.round(area.y+(area.height-height)/2),width,height});s.image=image;s.zoom=ratio;s.window.show();return s.window;
 }
 async openOcr(bytes?:Buffer,copy=false){
  this.deps.enabled(copy?'ocr:image-copy':'tool:ocr');
  if(!this.ocrSession){if(!this.ocrOpening){const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;this.ocrOpening=this.open(this.base('ocr'),{x:Math.round(area.x+(area.width-900)/2),y:Math.round(area.y+(area.height-620)/2),width:900,height:620}).then(s=>this.ocrSession=s).finally(()=>{this.ocrOpening=null;});}await this.ocrOpening;}
  const s=this.ocrSession!;if(!copy)s.window.show();
  if(bytes){s.image=this.image(bytes);s.state=this.base('ocr',s.image);this.changed(s);void this.recognize(s,copy);}else{s.window.show();s.window.focus();}
  return s.window;
 }
 private async stamp(){const sequence=this.deps.sequence();if(sequence!==null)return String(sequence);const hash=createHash('sha256');let total=0;for(const item of await clipboard.read())for(const type of [...item.types].sort()){hash.update(type);const value=await item.getType(type);if(value instanceof Blob){total+=value.size;if(total>64*1024*1024)return null;hash.update(Buffer.from(await value.arrayBuffer()));}else hash.update(JSON.stringify(value));}return hash.digest('hex');}
 private async recognize(s:Session,copy=false){
  if(s.state.kind!=='ocr'||!s.image)return;const generation=++s.generation;
  this.ocr.cancel();const state=s.state;state.phase='running';state.progress=0;state.text='';delete state.error;delete state.copied;this.changed(s);
  try{const stamp=copy?await this.stamp():null;if(s.generation!==generation)return;
   const text=await this.ocr.recognize(s.image.toPNG(),p=>{if(s.generation===generation){state.progress=p;this.changed(s);}});
   if(s.window.isDestroyed()||s.generation!==generation)return;state.text=text;state.phase='done';state.progress=1;
   if(!text){state.error=t("没有识别到文字，请换用更清晰的图片或缩小截图范围");s.window.show();}
   else if(copy){if(stamp!==null&&stamp===await this.stamp()){if(s.generation!==generation||s.window.isDestroyed())return;await clipboard.writeText(text);state.copied=true;s.window.hide();}else{state.error=t("识别期间剪贴板已改变，结果已保留，请按需复制");s.window.show();}}
   this.changed(s);
  }catch(error){if(s.window.isDestroyed()||s.generation!==generation)return;state.phase='error';state.error=(error as Error).message;s.window.show();this.changed(s);}
 }
 private async handle(s:Session,action:unknown,payload:unknown):Promise<unknown>{
  if(action==='state')return s.state;
  if(action==='cancel'){if(s.state.kind==='capture')this.capture.cancel();else s.window.close();return;}
  if(s.state.kind==='capture'){
   if(action!=='complete'||!payload||typeof payload!=='object'||!this.capture.owns(s.window.webContents.id))throw Error(t("截图操作无效"));const {rect,destination}=payload as any;if(destination!==undefined&&!destinations.includes(destination))throw Error(t("截图目标无效"));return this.capture.complete(rect,destination);
  }
  if(action==='stop'){s.generation++;this.ocr.cancel();s.state.phase='idle';this.changed(s);return;}
  if(action==='pick'){
   const result=await dialog.showOpenDialog(s.window,{title:t("选择需要识别的图片"),properties:['openFile'],filters:[{name:t("图片"),extensions:['png','jpg','jpeg','webp','bmp']}]});if(result.canceled||!result.filePaths[0])return;return this.setImage(s,await this.readFile(result.filePaths[0]));
  }
  if(action==='image'){
   const p=payload as {path?:unknown;data?:unknown};if(!p||typeof p!=='object')throw Error(t("图片输入无效"));if(typeof p.path==='string')return this.setImage(s,await this.readFile(p.path));
   if(typeof p.data!=='string'||p.data.length>28*1024*1024||!/^data:image\/(png|jpeg|webp|bmp);base64,[A-Za-z0-9+/]+=*$/.test(p.data))throw Error(t("图片输入无效"));return this.setImage(s,Buffer.from(p.data.slice(p.data.indexOf(',')+1),'base64'));
  }
  if(action==='ocr'){this.deps.enabled('tool:ocr');return this.recognize(s);}
  if(action==='copyText'||action==='launchText'){
   if(typeof payload!=='string'||payload.length>500_000||!payload.trim())throw Error(t("没有可用文字"));s.state.text=payload;if(action==='copyText')await clipboard.writeText(payload);else{await this.deps.launcher(payload);s.window.hide();}return;
  }
  if(!s.image)throw Error(t("请先选择图片"));
  if(action==='copy'||action==='save'||action==='launch'||action==='pin'){
   const destination=action==='launch'?'launcher':action;await this.output(s.image.toPNG(),destination,s.window);if(action==='launch')s.window.close();return;
  }
  if(action==='rotate'){
   const image=s.image,{width,height}=image.getSize(),bytes=image.toBitmap(),input=new Uint32Array(bytes.buffer,bytes.byteOffset,bytes.length/4),buffer=Buffer.alloc(bytes.length),output=new Uint32Array(buffer.buffer,buffer.byteOffset,buffer.length/4);
   for(let y=0;y<height;y++)for(let x=0;x<width;x++)output[x*height+height-1-y]=input[y*width+x];
   s.image=nativeImage.createFromBitmap(buffer,{width:height,height:width});s.state.image=s.image.toDataURL();if(s.state.kind==='pin')this.resizePin(s);this.changed(s);return;
  }
  if(action==='zoom'&&s.state.kind==='pin'){if(typeof payload!=='number'||!Number.isFinite(payload)||Math.abs(payload)>1)throw Error(t("缩放参数无效"));s.zoom=Math.min(4,Math.max(.1,s.zoom+payload));this.resizePin(s);return;}
  throw Error(t("不支持的图片操作"));
 }
 private async readFile(file:string){if(!path.isAbsolute(file))throw Error(t("图片路径无效"));const info=await stat(file);if(!info.isFile()||info.size>20*1024*1024)throw Error(t("请选择不超过 20 MB 的图片文件"));return readFile(file);}
 private setImage(s:Session,bytes:Buffer){if(s.state.kind!=='ocr')throw Error(t("当前窗口不能替换图片"));s.generation++;this.ocr.cancel();s.image=this.image(bytes);s.state=this.base('ocr',s.image);this.changed(s);void this.recognize(s);}
 private resizePin(s:Session){const size=s.image!.getSize(),old=s.window.getBounds(),area=screen.getDisplayMatching(old).workArea;const width=Math.max(320,Math.min(area.width*2,Math.round(size.width*s.zoom))),height=Math.max(100,Math.min(area.height*2,Math.round(size.height*s.zoom)))+40;s.window.setBounds({x:Math.round(old.x+(old.width-width)/2),y:Math.round(old.y+(old.height-height)/2),width,height});}
 refreshLocale(){for(const s of this.sessions.values())s.window.setTitle('Nexlet · '+(s.state.kind==='pin'?t("贴图"):s.state.kind==='ocr'?t("文字识别"):t("截图")));}
 close(){this.capture.close();this.ocr.cancel();for(const s of this.sessions.values())s.window.destroy();this.sessions.clear();ipcMain.removeHandler('desktop-tools');}
}
export function desktopCommands():Command[]{
 const imageMatches=[{type:'image' as const},{type:'files' as const,extensions:['png','jpg','jpeg','webp','bmp'],minCount:1,maxCount:1,fileType:'file' as const}];
 const commands:Command[] = [
  {id:'capture:region',name:"截图",subtitle:"框选区域，复制、保存或继续处理",kind:'system',keywords:['截图','screenshot','capture','jt'],color:'#528aef'},
  {id:'capture:screen',name:"当前屏截图",subtitle:"截取鼠标所在显示器；Linux 由系统选择屏幕",kind:'system',keywords:['全屏截图','fullscreen'],color:'#528aef'},
  {id:'capture:ocr',name:"截图 OCR 识别",subtitle:"截图后提取中英文文字",kind:'system',keywords:['ocr','文字识别','截图识别'],color:'#488e79'},
  {id:'capture:ocr-copy',name:"截图 OCR 识别复制",subtitle:"截图后识别并复制文字",kind:'system',keywords:['ocr','识别复制'],color:'#488e79'},
  {id:'tool:ocr',name:"OCR 文字识别",subtitle:"离线识别图片中的中英文文字",kind:'tool',keywords:['ocr','文字识别','图片转文字'],matches:imageMatches,color:'#488e79'},
  {id:'ocr:image-copy',name:"OCR 识别复制",subtitle:"识别当前图片并直接复制文字",kind:'system',keywords:['ocr','识别复制'],matches:imageMatches,color:'#488e79'},
  {id:'image:pin',name:"贴图",subtitle:"将图片悬浮在屏幕上，随时对照",kind:'system',keywords:['贴图','图片置顶','pin'],matches:imageMatches,color:'#ba8951'}
 ];
 return commands.map(localizeCommand);
}
