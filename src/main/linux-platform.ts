import { t } from '../shared/i18n';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { posix as path } from 'node:path';
export const LINUX_FILE_FORMATS=['x-special/gnome-copied-files','text/uri-list'];
export const osClipboardFormat=(format:string)=>`electron application/osclipboard;format="${format}"`;
export function decodeFileUris(text:string):string[]{
 if(Buffer.byteLength(text)>2*1024*1024)return [];
 const files=new Set<string>();for(const line of text.split(/\r?\n/)){
  if(!line.startsWith('file:'))continue;
  try{const url=new URL(line);if(url.protocol!=='file:'||url.hostname&&url.hostname!=='localhost'||url.search||url.hash)continue;const file=fileURLToPath(url,{windows:false});if(path.isAbsolute(file)&&!/[\0\r\n]/.test(file))files.add(file);}catch{}
  if(files.size>256)return [];
 }return [...files];
}
export function encodeFileUris(files:string[]):string{
 if(!files.length||files.length>256||files.some(f=>!path.isAbsolute(f)||/[\0\r\n]/.test(f)))throw Error(t("文件列表无效"));
 return files.map(f=>pathToFileURL(f,{windows:false}).href).join('\r\n')+'\r\n';
}
export interface LinuxTarget {handle:string;pid:number;}
type Runner=(command:string,args:string[],options:{timeout:number;maxBuffer:number})=>Promise<{stdout:string}>;
export class LinuxPaste {
 readonly wayland:boolean;
 status:string|null=null;
 constructor(private run:Runner=promisify(execFile),env:NodeJS.ProcessEnv=process.env){this.wayland=env.XDG_SESSION_TYPE==='wayland'||!!env.WAYLAND_DISPLAY;}
 private async command(args:string[]){return (await this.run('xdotool',args,{timeout:3000,maxBuffer:4096})).stdout.trim();}
 async remember():Promise<LinuxTarget|null>{
  if(this.wayland)return null;
  this.status=null;
  try{const handle=await this.command(['getactivewindow']);if(!/^\d+$/.test(handle))return null;const pid=Number(await this.command(['getwindowpid',handle]));return Number.isSafeInteger(pid)&&pid>0&&pid!==process.pid?{handle,pid}:null;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')this.status=t("X11 自动回贴需要 xdotool，请安装后重试；当前可复制后手动粘贴");return null;}
 }
 async paste(target:LinuxTarget){
  if(this.wayland)throw Error(t("Wayland 请复制后手动粘贴"));
  if(!/^\d+$/.test(target.handle))throw Error(t("原窗口已变化，请重新唤起"));
  try{
   if(Number(await this.command(['getwindowpid',target.handle]))!==target.pid)throw Error(t("原窗口已变化，请重新唤起"));
   await this.command(['windowactivate','--sync',target.handle]);
   if(await this.command(['getactivewindow'])!==target.handle||Number(await this.command(['getwindowpid',target.handle]))!==target.pid)throw Error(t("无法恢复原窗口焦点，内容已复制，请手动粘贴"));
   await this.command(['key','--clearmodifiers','ctrl+v']);
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw Error(t("自动回贴需要 xdotool，内容已复制，请手动粘贴"));throw error;}
 }
}
