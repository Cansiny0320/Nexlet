import {clipboard,ClipboardItem,nativeImage} from 'electron';
import type {Platform} from './platform';
import type {ClipboardService} from './clipboard';
import {createNativeSelection,type NativeSelection} from './selection-native';
import {createSelectionPasteboard,type NativePasteboardSnapshot} from './selection-pasteboard-mac';
import type {SelectionBackend,SelectionContent,SelectionTarget} from './selection';
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export class SelectionPlatform implements SelectionBackend {
 private native:NativeSelection|null=null;error:string|null=null;
 private pasteboard:ReturnType<typeof createSelectionPasteboard>|undefined;
 constructor(private platform:Platform,private clips:ClipboardService){try{this.native=createNativeSelection();}catch(e){this.error=(e as Error).message;}}
 trusted(){return !!this.native?.trusted();}
 async target(){return this.native?.target()||null;}
 async same(target:SelectionTarget){const current=await this.target();return !!current&&target.pid===current.pid&&target.handle===current.handle;}
 async direct(target:SelectionTarget){return this.native?.direct(target);}
 sequence(){return this.platform.sequence();}
 async snapshot():Promise<Record<string,unknown>>{
  if(process.platform==='darwin'){this.pasteboard??=createSelectionPasteboard();return this.pasteboard.snapshot();}
  const items=await clipboard.read(),data:Record<string,any>[]=[];let size=0;
  if(items.length>100)throw Error('原剪贴板内容过多，请手动粘贴选区');
  for(const item of items){const formats:Record<string,any>={};if(item.types.length>128)throw Error('原剪贴板格式过多，请手动粘贴选区');for(const type of item.types){const value=await item.getType(type);if(value instanceof Blob){size+=value.size;if(size>64*1024*1024)throw Error('原剪贴板超过 64 MB，已保留原内容，请手动粘贴选区');formats[type]=new Blob([await value.arrayBuffer()],{type:value.type});}else formats[type]=structuredClone(value);}data.push(formats);}
  return {data};
 }
 async restore(snapshot:Record<string,unknown>,expected:number){if(this.sequence()!==expected)return;if(snapshot.native==='mac'){this.pasteboard??=createSelectionPasteboard();this.pasteboard.restore(snapshot as NativePasteboardSnapshot,expected);return;}const data=snapshot.data as Record<string,any>[];await clipboard.write(data.map(value=>new ClipboardItem(value)));}
 async copy(target:SelectionTarget){if(!this.native)throw Error(this.error||'系统选区桥接不可用');this.native.copy(target);}
 async waitKeys(){const end=Date.now()+800;while(this.native&&!this.native.keysReleased()&&Date.now()<end)await delay(20);return !!this.native?.keysReleased();}
 async read():Promise<SelectionContent|undefined>{
  const items=await clipboard.read(),formats=items.flatMap(i=>i.types);
  if(formats.some(f=>/ConcealedType|TransientType|ExcludeClipboardContentFromMonitorProcessing|application\/x-keepassxc/i.test(f)))return;
  const paths=await this.platform.readFiles();if(paths.length)return {type:'files',paths};
  const image=items.find(i=>i.types.includes('image/png'));
  if(image){const blob=await image.getType('image/png');if(blob instanceof Blob){if(blob.size>20*1024*1024)throw Error('选区图片超过 20 MB');const picture=nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer()));if(!picture.isEmpty()){const size=picture.getSize();if(size.width*size.height>36_000_000)throw Error('选区图片超过 3600 万像素');return {type:'image',data:picture.toDataURL()};}}}
  const text=await clipboard.readText();if(text){if(text.length>500_000)throw Error('选区超过 50 万字符');return {type:'text',text};}
 }
 exclusive<T>(work:()=>Promise<T>){return this.clips.withoutCapture(work);}
 delay=delay;now=Date.now;
 remember(target:SelectionTarget|null){if(target)this.platform.target={pid:target.pid,...(target.handle?{handle:BigInt(target.handle)}:{})};}
 async restoreFocus(target:SelectionTarget|null){if(target)this.native?.activate(target);}
}
