import {parentPort,receiveMessageOnPort,workerData} from 'node:worker_threads';
import koffi from 'koffi';
import {PanelGesture,type GestureEffect,type GestureEvent} from './panel-gesture';
import {createNativeSelection} from './selection-native';
interface Config {mouse:'right'|'middle';holdMs:number;excludedApps:string[];busy:boolean;}
let config=workerData as Config,gesture=new PanelGesture(config.mouse,config.holdMs),stopped=false;
const native=createNativeSelection();
const send=(data:unknown)=>parentPort?.postMessage(data);
let replay:(effect:GestureEffect)=>void=()=>{},shutdown=()=>{},pump=()=>{},waitForInput=()=>{};
let heldTarget:{pid:number;handle?:string}|null=null;
let panelArea:{x:number;y:number;width:number;height:number}|null=null;
function apply(effect:GestureEffect){
 if(effect.replay)replay(effect);
 if(effect.trigger)send({type:'trigger',point:effect.trigger});
 if(effect.release){send({type:'release',...effect.release});heldTarget=null;}
}
function handle(event:GestureEvent){
 if(event.type==='down'){
  send({type:'pointerDown',point:{x:event.x,y:event.y}});
  if(panelArea&&event.x>=panelArea.x&&event.x<=panelArea.x+panelArea.width&&event.y>=panelArea.y&&event.y<=panelArea.y+panelArea.height)return false;
  if(event.button===config.mouse){
   const target=native.target();
   if(config.busy||!target||config.excludedApps.some(value=>[target.app,target.name].some(name=>name?.toLowerCase()===value.toLowerCase())))return false;
   heldTarget=target;
  }
 }
 const effect=gesture.handle(event);apply(effect);if(effect.replay)heldTarget=null;if(event.type==='move'&&effect.suppress)send({type:'move',point:{x:event.x,y:event.y}});return effect.suppress;
}
function tick(){
 if(heldTarget){const current=native.target();if(!current||current.pid!==heldTarget.pid||current.handle!==heldTarget.handle){gesture.cancel();heldTarget=null;return;}}
 apply(gesture.tick(Date.now()));
}
function stop(){if(stopped)return;stopped=true;apply(gesture.cancel());shutdown();parentPort?.close();}
function receive(message:any){
 if(message.type==='stop')stop();
 else if(message.type==='panel')panelArea=message.bounds;
 else if(message.type==='config'){apply(gesture.cancel());heldTarget=null;config=message.config;gesture=new PanelGesture(config.mouse,config.holdMs);}
}
try{
 if(process.platform==='darwin')mac();else if(process.platform==='win32')windows();else throw Error('当前平台不支持鼠标超级面板');
 send({type:'ready'});
 if(process.platform==='win32'){
  // WH_MOUSE_LL blocks system input until this installing thread responds.
  // Wait on the Windows input queue instead of sleeping on a JS timer. Keep
  // control messages synchronous too: this worker owns a native message loop.
  while(!stopped){
   for(let i=0;i<64&&parentPort&&!stopped;i++){const pending=receiveMessageOnPort(parentPort);if(!pending)break;receive(pending.message);}
   if(stopped)break;
   pump();tick();waitForInput();
  }
 }else{
  const timer=setInterval(()=>{try{pump();tick();}catch(error){send({type:'error',error:(error as Error).message});clearInterval(timer);stop();}},8);
  parentPort?.on('message',message=>{if(message.type==='stop')clearInterval(timer);receive(message);});
 }
}catch(error){send({type:'error',error:(error as Error).message});stop();}
function mac(){
 const cg=koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics'),cf=koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
 const point=koffi.struct('PanelCGPoint',{x:'double',y:'double'}),callback=koffi.proto('void *PanelTapCallback(void *,uint32_t,void *,void *)');
 const tapCreate=cg.func('CGEventTapCreate','void *',['uint32_t','uint32_t','uint32_t','uint64_t',koffi.pointer(callback),'void *']);
 const location=cg.func('CGEventGetLocation',point,['void *']),integer=cg.func('int64_t CGEventGetIntegerValueField(void *,uint32_t)'),setInteger=cg.func('void CGEventSetIntegerValueField(void *,uint32_t,int64_t)');
 const createMouse=cg.func('CGEventCreateMouseEvent','void *',['void *','uint32_t',point,'uint32_t']),post=cg.func('void CGEventPost(uint32_t,void *)'),tapEnable=cg.func('void CGEventTapEnable(void *,bool)');
 const release=cf.func('void CFRelease(void *)'),sourceCreate=cf.func('void *CFMachPortCreateRunLoopSource(void *,void *,intptr_t)'),getLoop=cf.func('void *CFRunLoopGetCurrent()'),add=cf.func('void CFRunLoopAddSource(void *,void *,void *)'),remove=cf.func('void CFRunLoopRemoveSource(void *,void *,void *)'),run=cf.func('int CFRunLoopRunInMode(void *,double,bool)'),invalidate=cf.func('void CFMachPortInvalidate(void *)');
 const mode=koffi.decode(cf.symbol('kCFRunLoopDefaultMode'),'void *'),marker=0x4e58504c;
 let tap:unknown;
 const cb=koffi.register((_proxy:unknown,type:number,event:unknown)=>{
  try{
   if(type>=0xfffffffe){gesture.cancel();heldTarget=null;if(type===0xfffffffe&&tap)tapEnable(tap,true);else send({type:'error',error:'鼠标监听已被系统停用，请重新开启超级面板'});return event;}
   if(Number(integer(event,42))===marker)return event;
   const {x,y}=location(event),button=[3,4,7].includes(type)?'right':[25,26,27].includes(type)&&Number(integer(event,3))===2?'middle':'left';
   const kind=[1,3,25].includes(type)?'down':[2,4,26].includes(type)?'up':'move';
   return handle({type:kind,button,time:Date.now(),x,y})?null:event;
  }catch{gesture.cancel();heldTarget=null;return event;}
 },koffi.pointer(callback));
 const mask=[1,2,3,4,5,6,7,25,26,27].reduce((n,type)=>n|(1n<<BigInt(type)),0n);
 tap=tapCreate(1,0,0,mask,cb,null);if(!tap){koffi.unregister(cb);throw Error('请允许 Nexlet 使用辅助功能和输入监控，再重新开启鼠标触发');}
 const source=sourceCreate(null,tap,0),loop=getLoop();if(!source){invalidate(tap);release(tap);koffi.unregister(cb);throw Error('无法创建鼠标监听事件源');}add(loop,source,mode);
 replay=effect=>{if(!effect.point)return;const down=config.mouse==='right'?3:25,up=config.mouse==='right'?4:26,button=config.mouse==='right'?1:2;for(const type of effect.replay==='click'?[down,up]:[down]){const event=createMouse(null,type,effect.point,button);if(event)try{setInteger(event,42,marker);post(1,event);}finally{release(event);}}};
 pump=()=>{for(let i=0;i<32;i++)if(run(mode,0,true)!==4)break;};
 shutdown=()=>{tapEnable(tap,false);remove(loop,source,mode);invalidate(tap);release(source);release(tap);koffi.unregister(cb);};
}
function windows(){
 const user=koffi.load('user32.dll'),kernel=koffi.load('kernel32.dll');
 const point=koffi.struct('PanelPoint',{x:'int32_t',y:'int32_t'}),mouse=koffi.struct('PanelMSLLHOOKSTRUCT',{pt:point,mouseData:'uint32_t',flags:'uint32_t',time:'uint32_t',dwExtraInfo:'uintptr_t'}),message=koffi.struct('PanelMSG',{hwnd:'uintptr_t',message:'uint32_t',wParam:'uintptr_t',lParam:'intptr_t',time:'uint32_t',pt:point,lPrivate:'uint32_t'});
 const callback=koffi.proto('intptr_t __stdcall PanelMouseCallback(int,uintptr_t,void *)'),install=user.func('SetWindowsHookExW','uintptr_t',['int',koffi.pointer(callback),'uintptr_t','uint32_t']),next=user.func('intptr_t __stdcall CallNextHookEx(uintptr_t,int,uintptr_t,void *)'),unhook=user.func('bool __stdcall UnhookWindowsHookEx(uintptr_t)'),peek=user.func('PeekMessageW','bool',[koffi.out(koffi.pointer(message)),'uintptr_t','uint32_t','uint32_t','uint32_t']),translate=user.func('bool __stdcall TranslateMessage(const void *)'),dispatch=user.func('intptr_t __stdcall DispatchMessageW(const void *)'),module=kernel.func('uintptr_t __stdcall GetModuleHandleW(void *)'),sendInput=user.func('uint32_t __stdcall SendInput(uint32_t,const void *,int)');
 const marker=0x4e58504c;
 const cb=koffi.register((code:number,wparam:number|bigint,lparam:unknown)=>{try{
  if(code<0)return next(0,code,wparam,lparam);const data=koffi.decode(lparam,mouse) as any;if(Number(data.dwExtraInfo)===marker)return next(0,code,wparam,lparam);
  const type=Number(wparam),button=[0x204,0x205].includes(type)?'right':[0x207,0x208].includes(type)?'middle':'left',kind=[0x201,0x204,0x207].includes(type)?'down':[0x202,0x205,0x208].includes(type)?'up':'move';
  if([0x200,0x201,0x202,0x204,0x205,0x207,0x208].includes(type)&&handle({type:kind,button,time:Date.now(),x:data.pt.x,y:data.pt.y}))return 1;
 }catch{gesture.cancel();heldTarget=null;}return next(0,code,wparam,lparam);},koffi.pointer(callback));
 const hook=install(14,cb,module(null),0);if(!hook){koffi.unregister(cb);throw Error('Windows 鼠标监听注册失败，可继续使用面板快捷键');}
 replay=effect=>{const size=process.arch==='ia32'?28:40,offset=process.arch==='ia32'?4:8,down=config.mouse==='right'?0x8:0x20,up=config.mouse==='right'?0x10:0x40,flags=effect.replay==='click'?[down,up]:[down],buffer=Buffer.alloc(size*flags.length);flags.forEach((flag,i)=>{buffer.writeUInt32LE(flag,i*size+offset+12);if(size===40)buffer.writeBigUInt64LE(BigInt(marker),i*size+offset+24);else buffer.writeUInt32LE(marker,i*size+offset+20);});sendInput(flags.length,buffer,size);};
 const msg=Buffer.alloc(koffi.sizeof(message));pump=()=>{for(let i=0;i<64&&peek(msg,0,0,0,1);i++){translate(msg);dispatch(msg);}};
 shutdown=()=>{unhook(hook);koffi.unregister(cb);};
 const wait=user.func('uint32_t __stdcall MsgWaitForMultipleObjectsEx(uint32_t,const void *,uint32_t,uint32_t,uint32_t)');
 // QS_ALLINPUT | MWMO_INPUTAVAILABLE wakes immediately for mouse hooks, even
 // after PeekMessage has observed input. The timeout only bounds gesture ticks
 // and parent-port control latency; it does not delay incoming mouse events.
 waitForInput=()=>{if(wait(0,null,8,0x04ff,0x0004)===0xffffffff)throw Error('Windows 鼠标消息等待失败');};
}
