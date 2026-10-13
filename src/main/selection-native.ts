import koffi from 'koffi';
import type {SelectionTarget,SelectionContent} from './selection';
export interface NativeSelection {
 target():SelectionTarget|null;direct(target:SelectionTarget):SelectionContent|null|undefined;
 copy(target:SelectionTarget):void;keysReleased():boolean;activate(target:SelectionTarget):boolean;trusted():boolean;
}
export function createNativeSelection():NativeSelection{
 if(process.platform==='darwin')return macSelection();
 if(process.platform==='win32')return winSelection();
 return {target:()=>null,direct:()=>undefined,copy:()=>{throw Error('当前平台不支持自动获取选区');},keysReleased:()=>true,activate:()=>false,trusted:()=>false};
}
function macSelection():NativeSelection{
 const kit=koffi.load('/System/Library/Frameworks/AppKit.framework/AppKit'),objc=koffi.load('/usr/lib/libobjc.A.dylib'),cf=koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation'),ax=koffi.load('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices'),cg=koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
 const cls=objc.func('void *objc_getClass(const char *)'),sel=objc.func('void *sel_registerName(const char *)');
 const object=objc.func('objc_msgSend','void *',['void *','void *']),integer=objc.func('objc_msgSend','intptr_t',['void *','void *']),cstring=objc.func('objc_msgSend','str',['void *','void *']);
 const byPid=objc.func('objc_msgSend','void *',['void *','void *','int']),activate=objc.func('objc_msgSend','bool',['void *','void *','uint64_t']);
 const poolClass=cls('NSAutoreleasePool'),workspace=cls('NSWorkspace'),running=cls('NSRunningApplication');
 const selectors=Object.fromEntries(['alloc','init','drain','sharedWorkspace','frontmostApplication','processIdentifier','bundleIdentifier','localizedName','UTF8String','runningApplicationWithProcessIdentifier:','activateWithOptions:'].map(s=>[s,sel(s)]));
 const drain=objc.func('objc_msgSend','void',['void *','void *']);
 const release=cf.func('void CFRelease(void *)'),makeString=cf.func('void *CFStringCreateWithCString(void *,const char *,uint32_t)'),getString=cf.func('bool CFStringGetCString(void *,_Out_ char *,intptr_t,uint32_t)'),length=cf.func('intptr_t CFStringGetLength(void *)');
 const getType=cf.func('uintptr_t CFGetTypeID(void *)'),stringType=cf.func('uintptr_t CFStringGetTypeID()');
 const appElement=ax.func('void *AXUIElementCreateApplication(int)'),getAttribute=ax.func('int AXUIElementCopyAttributeValue(void *,void *,_Out_ void **)'),timeout=ax.func('int AXUIElementSetMessagingTimeout(void *,float)'),trusted=ax.func('bool AXIsProcessTrusted()');
 const keyState=cg.func('bool CGEventSourceKeyState(int,uint16_t)'),key=cg.func('void *CGEventCreateKeyboardEvent(void *,uint16_t,bool)'),flags=cg.func('void CGEventSetFlags(void *,uint64_t)'),post=cg.func('void CGEventPost(uint32_t,void *)');
 const pooled=<T>(work:()=>T):T=>{const pool=object(object(poolClass,selectors.alloc),selectors.init);try{return work();}finally{if(pool)drain(pool,selectors.drain);void kit;}};
 const attr=(element:unknown,name:string)=>{const k=makeString(null,name,0x08000100),out=[null];try{return getAttribute(element,k,out)===0?out[0]:null;}finally{release(k);}};
 const str=(value:unknown)=>{if(!value||getType(value)!==stringType())return undefined;const size=Number(length(value))*4+1;if(size>2_000_001)throw Error('选区超过 50 万字符');const out=Buffer.alloc(size);return getString(value,out,size,0x08000100)?out.subarray(0,out.indexOf(0)).toString('utf8'):undefined;};
 return {
  target:()=>pooled(()=>{const front=object(object(workspace,selectors.sharedWorkspace),selectors.frontmostApplication);if(!front)return null;const pid=Number(integer(front,selectors.processIdentifier));if(!pid||pid===process.pid)return null;const bundle=object(front,selectors.bundleIdentifier),name=object(front,selectors.localizedName);return {pid,app:bundle?cstring(bundle,selectors.UTF8String):'',name:name?cstring(name,selectors.UTF8String):''};}),
  direct:target=>{if(!trusted())return undefined;const root=appElement(target.pid);if(!root)return undefined;let focused:unknown;try{timeout(root,0.15);focused=attr(root,'AXFocusedUIElement');if(!focused)return undefined;timeout(focused,0.15);const subrole=attr(focused,'AXSubrole');if(subrole){try{if(str(subrole)==='AXSecureTextField')return null;}finally{release(subrole);}}const value=attr(focused,'AXSelectedText');if(!value)return undefined;try{const text=str(value);return text===undefined?undefined:text?{type:'text',text}:null;}finally{release(value);}}finally{if(focused)release(focused);release(root);}},
  copy:()=>{if(!trusted())throw Error('请在系统设置中允许 Nexlet 使用辅助功能，再重新获取选区');for(const down of [true,false]){const event=key(null,8,down);if(!event)throw Error('无法创建复制按键');try{flags(event,1<<20);post(1,event);}finally{release(event);}}},
  keysReleased:()=>![54,55,56,58,59,60,61,62].some(code=>keyState(1,code)),
  activate:target=>pooled(()=>{const app=byPid(running,selectors['runningApplicationWithProcessIdentifier:'],target.pid);return !!app&&activate(app,selectors['activateWithOptions:'],2);}),
  trusted:()=>trusted()
 };
}
function winSelection():NativeSelection{
 const user=koffi.load('user32.dll'),kernel=koffi.load('kernel32.dll');
 const front=user.func('uintptr_t __stdcall GetForegroundWindow()'),pidFor=user.func('uint32_t __stdcall GetWindowThreadProcessId(uintptr_t,_Out_ uint32_t *)'),isWindow=user.func('bool __stdcall IsWindow(uintptr_t)'),focus=user.func('bool __stdcall SetForegroundWindow(uintptr_t)'),keyState=user.func('int16_t __stdcall GetAsyncKeyState(int)'),send=user.func('uint32_t __stdcall SendInput(uint32_t,const void *,int)');
 const open=kernel.func('void *__stdcall OpenProcess(uint32_t,bool,uint32_t)'),close=kernel.func('bool __stdcall CloseHandle(void *)'),query=kernel.func('bool __stdcall QueryFullProcessImageNameW(void *,uint32_t,_Out_ uint8_t *,_Inout_ uint32_t *)');
 const info=(handle:number|bigint):SelectionTarget|null=>{const pid=[0];pidFor(handle,pid);if(!pid[0]||pid[0]===process.pid)return null;let name='';const processHandle=open(0x1000,false,pid[0]);if(processHandle)try{const buffer=Buffer.alloc(65536),size=[32768];if(query(processHandle,0,buffer,size))name=buffer.toString('utf16le',0,size[0]*2).split('\\').pop()||'';}finally{close(processHandle);}return {pid:pid[0],handle:String(handle),app:name.toLowerCase(),name};};
 return {target:()=>info(front()),direct:()=>undefined,trusted:()=>true,
  copy:target=>{const terminal=['cmd.exe','powershell.exe','pwsh.exe','windowsterminal.exe','wezterm-gui.exe','alacritty.exe'].includes(target.app.toLowerCase()),code=terminal?0x2d:0x43,size=process.arch==='ia32'?28:40,offset=process.arch==='ia32'?4:8;const data=Buffer.alloc(size*4);[[0x11,0],[code,0],[code,2],[0x11,2]].forEach(([key,flags],i)=>{data.writeUInt32LE(1,i*size);data.writeUInt16LE(key,i*size+offset);data.writeUInt32LE(flags,i*size+offset+4);});if(send(4,data,size)!==4)throw Error('系统阻止了复制按键；请手动复制选区，或检查目标应用权限');},
  keysReleased:()=>![0x10,0x11,0x12,0x5b,0x5c].some(code=>(keyState(code)&0x8000)!==0),
  activate:target=>{if(!target.handle)return false;const handle=BigInt(target.handle);return isWindow(handle)&&info(handle)?.pid===target.pid&&focus(handle);}
 };
}
