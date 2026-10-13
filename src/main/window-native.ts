import koffi from 'koffi';
import {screen} from 'electron';
import {createNativeSelection} from './selection-native';
import type {WindowBackend} from './window-actions';
import type {WindowRect} from '../shared/window-layout';

export function createWindowBackend():WindowBackend{
 let native:WindowBackend|undefined;
 const get=()=>native??=(process.platform==='darwin'?macWindows():process.platform==='win32'?winWindows():unsupported());
 return {capture:()=>get().capture(),read:id=>get().read(id),write:(id,r)=>get().write(id,r),activate:id=>get().activate(id),close:()=>native?.close()};
}
function unsupported():WindowBackend{const fail=()=>{throw Error('当前平台暂不支持外部窗口布局；本批支持 macOS 和 Windows');};return {capture:()=>null,read:fail,write:fail,activate:fail,close:()=>{}};}
function macWindows():WindowBackend{
 const selection=createNativeSelection(),ax=koffi.load('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices'),cf=koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
 const makeString=cf.func('void *CFStringCreateWithCString(void *,const char *,uint32_t)'),release=cf.func('void CFRelease(void *)'),equal=cf.func('bool CFEqual(void *,void *)'),boolean=cf.func('bool CFBooleanGetValue(void *)');
 const app=ax.func('void *AXUIElementCreateApplication(int)'),timeout=ax.func('int AXUIElementSetMessagingTimeout(void *,float)'),get=ax.func('int AXUIElementCopyAttributeValue(void *,void *,_Out_ void **)'),set=ax.func('int AXUIElementSetAttributeValue(void *,void *,void *)'),perform=ax.func('int AXUIElementPerformAction(void *,void *)'),value=ax.func('void *AXValueCreate(int,const void *)'),unpack=ax.func('bool AXValueGetValue(void *,int,_Out_ void *)');
 const targets=new Map<string,{window:unknown;pid:number}>();let serial=0;
 const attribute=(window:unknown,name:string,required=true)=>{const key=makeString(null,name,0x08000100),out=[null];try{const code=get(window,key,out);if(code&&required)throw Error(code===-25202?'目标窗口已关闭，请重新唤起 Nexlet':'无法读取窗口；请检查辅助功能权限及目标应用是否响应');return code?null:out[0];}finally{release(key);}};
 const target=(id:string)=>{const t=targets.get(id);if(!t)throw Error('窗口已失效，请重新唤起 Nexlet');return t;};
 const pair=(window:unknown,name:string,type:number)=>{const v=attribute(window,name),bytes=Buffer.alloc(16);try{if(!unpack(v,type,bytes))throw Error('窗口几何信息无效');return [bytes.readDoubleLE(0),bytes.readDoubleLE(8)];}finally{release(v);}};
 const full=(window:unknown)=>{const v=attribute(window,'AXFullScreen',false);try{return !!v&&boolean(v);}finally{if(v)release(v);}};
 const setPair=(window:unknown,name:string,type:number,a:number,b:number)=>{const bytes=Buffer.alloc(16);bytes.writeDoubleLE(a,0);bytes.writeDoubleLE(b,8);const v=value(type,bytes),key=makeString(null,name,0x08000100);try{if(set(window,key,v)!==0)throw Error('目标应用不允许调整窗口，或辅助功能权限已失效');}finally{release(v);release(key);}};
 return {
  capture(){const front=selection.target();if(!front)return null;if(!selection.trusted())throw Error('请在系统设置 → 隐私与安全性 → 辅助功能中允许 Nexlet');const root=app(front.pid);let window:unknown;try{timeout(root,.15);window=attribute(root,'AXFocusedWindow');}finally{release(root);}timeout(window,.15);
   for(const [id,t] of targets)if(t.pid===front.pid&&equal(t.window,window)){release(window);return id;}
   const id='mac-window-'+(++serial);targets.set(id,{window,pid:front.pid});if(targets.size>32){const first=targets.keys().next().value!;release(targets.get(first)!.window);targets.delete(first);}return id;
  },
  read(id){const {window}=target(id);if(full(window))throw Error('请先退出目标窗口的系统全屏模式');const [x,y]=pair(window,'AXPosition',1),[width,height]=pair(window,'AXSize',2);return {x,y,width,height};},
  write(id,r){const {window}=target(id);if(full(window))throw Error('请先退出目标窗口的系统全屏模式');pair(window,'AXPosition',1);setPair(window,'AXSize',2,r.width,r.height);setPair(window,'AXPosition',1,r.x,r.y);setPair(window,'AXSize',2,r.width,r.height);},
  activate(id){const t=target(id);selection.activate({pid:t.pid,app:''});const action=makeString(null,'AXRaise',0x08000100);try{perform(t.window,action);}finally{release(action);}},
  close(){for(const t of targets.values())release(t.window);targets.clear();}
 };
}
function winWindows():WindowBackend{
 const user=koffi.load('user32.dll'),dwm=koffi.load('dwmapi.dll');
 const front=user.func('uintptr_t __stdcall GetForegroundWindow()'),pidFor=user.func('uint32_t __stdcall GetWindowThreadProcessId(uintptr_t,_Out_ uint32_t *)'),valid=user.func('bool __stdcall IsWindow(uintptr_t)'),rect=user.func('bool __stdcall GetWindowRect(uintptr_t,_Out_ void *)'),frame=dwm.func('int __stdcall DwmGetWindowAttribute(uintptr_t,uint32_t,_Out_ void *,uint32_t)'),set=user.func('bool __stdcall SetWindowPos(uintptr_t,uintptr_t,int,int,int,int,uint32_t)'),focus=user.func('bool __stdcall SetForegroundWindow(uintptr_t)'),show=user.func('bool __stdcall ShowWindow(uintptr_t,int)'),iconic=user.func('bool __stdcall IsIconic(uintptr_t)'),zoomed=user.func('bool __stdcall IsZoomed(uintptr_t)');
 const pid=(handle:number|bigint)=>{const out=[0];pidFor(handle,out);return out[0];};
 const target=(id:string)=>{const [handle,p]=id.split(':');const h=BigInt(handle);if(!valid(h)||pid(h)!==Number(p))throw Error('目标窗口已关闭，请重新唤起 Nexlet');return h;};
 const unpack=(b:Buffer):WindowRect=>({x:b.readInt32LE(0),y:b.readInt32LE(4),width:b.readInt32LE(8)-b.readInt32LE(0),height:b.readInt32LE(12)-b.readInt32LE(4)});
 const geometry=(h:bigint)=>{const outer=Buffer.alloc(16),visible=Buffer.alloc(16);if(!rect(h,outer))throw Error('无法读取目标窗口');const raw=unpack(outer);return {raw,visible:frame(h,9,visible,16)===0?unpack(visible):raw};};
 return {capture(){const h=front(),p=pid(h);return p&&p!==process.pid?String(h)+':'+p:null;},
  read(id){return screen.screenToDipRect(null,geometry(target(id)).visible);},
  write(id,r){const h=target(id);if(iconic(h)||zoomed(h))show(h,9);const {raw,visible}=geometry(h),next=screen.dipToScreenRect(null,r);if(!set(h,0,next.x+raw.x-visible.x,next.y+raw.y-visible.y,next.width+raw.width-visible.width,next.height+raw.height-visible.height,0x14))throw Error('系统阻止了窗口调整，请检查目标应用权限');},
  activate(id){focus(target(id));},close(){}
 };
}
