import { BrowserWindow, WebContentsView, session, type Session } from 'electron';
import { realpath, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { safeEntryPath } from '../shared/plugin-validation';
import { inputContext, type LaunchInput } from '../shared/launch';
import type { PluginRecord, PluginSessionState } from '../shared/types';
import type { InputSnapshot, LaunchInputs } from './launch-input';
import { revealWindow } from './window-visibility';

const MIME:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.woff2':'font/woff2'};
const CSP="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export interface PluginHost { main:()=>BrowserWindow; createDetached:()=>BrowserWindow; changed:(window:BrowserWindow)=>void; error:(message:string)=>void; }
interface RunningPlugin {
  record:PluginRecord; view:WebContentsView; owner:BrowserWindow; detached:boolean; isolated:Session;
  code:string; payload:string; input:LaunchInput; activated:boolean; closing:boolean; disposed:boolean;
  loaded:Promise<void>; ready:()=>void; rejectReady:(error:Error)=>void; queue:Promise<unknown>;
  sequence:number; acknowledgements:Map<number,()=>void>; removeOwnerListeners:()=>void;
}

/** A renderer/session owns plugin state. Reparenting its view never reloads it. */
export class PluginRuntime {
  readonly sessions=new Map<string,RunningPlugin>();
  readonly callers=new Map<number,RunningPlugin>();
  private host:PluginHost|null=null;
  private navigation=0;
  private epochs=new Map<string,number>();
  private detaching=new Set<string>();
  private entryQueue:Promise<unknown>=Promise.resolve();
  private preparing=new Map<string,AbortController>();
  private suspended=false;
  private overlays=new Set<number>();
  constructor(private inputs:LaunchInputs,private releaseSession:(id:number)=>void=()=>{}){}
  configure(host:PluginHost){this.host=host;}
  state(owner:BrowserWindow):PluginSessionState|null {
    const current=this.forWindow(owner);
    return current?{id:current.record.manifest.id,name:current.record.manifest.name,code:current.code,detached:current.detached,loading:!current.activated}:null;
  }
  private forWindow(owner:BrowserWindow){return [...this.sessions.values()].find(s=>s.owner===owner&&!s.closing);}
  focus(id:string,code:string):boolean {
    const active=this.sessions.get(id);
    if(!active||active.code!==code||!active.activated||active.closing||active.disposed)return false;
    revealWindow(active.owner);active.view.webContents.focus();return true;
  }
  launch(record:PluginRecord,code:string,snapshot:InputSnapshot,prepare?:(isCurrent:()=>boolean,signal:AbortSignal)=>Promise<PluginRecord>):Promise<void>{
    const generation=this.navigation,epoch=this.epochs.get(record.manifest.id)||0;
    const isCurrent=()=>!!this.host&&generation===this.navigation&&epoch===(this.epochs.get(record.manifest.id)||0);
    const run=async()=>{
      if(!isCurrent())throw new Error('插件启动已取消');
      let current=this.sessions.get(record.manifest.id);
      if(!current){
        if(prepare){
          const controller=new AbortController();this.preparing.set(record.manifest.id,controller);
          try{record=await prepare(isCurrent,controller.signal);}finally{this.preparing.delete(record.manifest.id);}
          if(!isCurrent())throw new Error('插件启动已取消');
        }
        const previous=this.forWindow(this.host!.main());
        if(previous)await this.stop(previous.record.manifest.id,false);
        if(generation!==this.navigation)throw new Error('插件启动已取消');
        current=this.create(record,code,snapshot);
      }
      const active=current;
      const activate=async()=>{
        await active.loaded;
        if(active.closing||active.disposed)throw new Error('插件启动已取消');
        if(active.activated){
          active.code=code;active.input=this.inputs.grant(active.view.webContents.id,snapshot);
          active.payload=active.input.type==='text'?active.input.text.slice(0,65536):'';
          active.view.webContents.send('plugin-activate',{code,payload:active.payload});
        }else{
          active.activated=true;
          await this.emit(active,'ready',undefined);
        }
        if(active.closing)return;
        await this.emit(active,'enter',inputContext(active.input,active.code));
        if(active.closing)return;
        this.host!.changed(active.owner);this.layout(active);revealWindow(active.owner);active.view.webContents.focus();
      };
      const next=active.queue.then(activate);active.queue=next.catch(()=>{});await next;
    };
    const next=this.entryQueue.then(run);this.entryQueue=next.catch(()=>{});return next;
  }
  private create(record:PluginRecord,code:string,snapshot:InputSnapshot):RunningPlugin {
    const id=record.manifest.id,partition=`nexlet-plugin-${id}-${randomUUID()}`,isolated=session.fromPartition(partition);
    const root=realpath(record.directory);void root.catch(()=>{});
    isolated.setPermissionCheckHandler(()=>false);isolated.setPermissionRequestHandler((_c,_p,reply)=>reply(false));
    isolated.webRequest.onBeforeRequest((details,reply)=>{const url=new URL(details.url);reply({cancel:!(url.protocol==='nexlet-plugin:'&&url.hostname===id)&&!['data:','blob:'].includes(url.protocol)});});
    isolated.protocol.handle('nexlet-plugin',async request=>{
      try{
        const url=new URL(request.url);if(url.hostname!==id)throw new Error('来源不符');
        const directory=await root,relative=safeEntryPath(decodeURIComponent(url.pathname.slice(1))),file=await realpath(path.join(directory,relative)),relation=path.relative(directory,file);
        if(relation.startsWith('..')||path.isAbsolute(relation))throw new Error('资源不在插件目录中');
        const bytes=await readFile(file);if(bytes.length>10*1024*1024)throw new Error('文件过大');
        return new Response(bytes,{headers:{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff'}});
      }catch{return new Response('无法读取插件资源',{status:403});}
    });
    const view=new WebContentsView({webPreferences:{preload:path.join(__dirname,'../preload/plugin.cjs'),partition,sandbox:true,contextIsolation:true,nodeIntegration:false,webviewTag:false,spellcheck:false}});
    let ready!:()=>void,rejectReady!:(error:Error)=>void;
    const handshake=new Promise<void>((resolve,reject)=>{ready=resolve;rejectReady=reject;});void handshake.catch(()=>{});
    const input=this.inputs.grant(view.webContents.id,snapshot);
    const active:RunningPlugin={record,view,owner:this.host!.main(),detached:false,isolated,code,input,payload:input.type==='text'?input.text.slice(0,65536):'',activated:false,closing:false,disposed:false,loaded:Promise.resolve(),ready,rejectReady,queue:Promise.resolve(),sequence:0,acknowledgements:new Map(),removeOwnerListeners:()=>{}};
    this.sessions.set(id,active);this.callers.set(view.webContents.id,active);this.attach(active,active.owner,false);
    view.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    view.webContents.on('will-navigate',event=>event.preventDefault());
    view.webContents.on('will-attach-webview',event=>event.preventDefault());
    view.webContents.on('before-input-event',(event,input)=>{
      if(input.type!=='keyDown')return;
      if(input.key==='Escape'){event.preventDefault();void this.exitWindow(active.owner);}
      else if((input.control||input.meta)&&input.key===','){event.preventDefault();const owner=active.owner;void this.exitWindow(owner).then(()=>{if(!owner.isDestroyed())owner.webContents.send('host-change','navigate:settings');});}
    });
    view.webContents.once('render-process-gone',()=>this.fail(active,'意外退出，可以重新打开'));
    view.webContents.once('unresponsive',()=>this.fail(active,'无响应，已关闭此插件'));
    view.webContents.once('destroyed',()=>this.dispose(active,true));
    let timer:ReturnType<typeof setTimeout>;
    const deadline=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('插件加载超时')),12000);});
    active.loaded=Promise.race([view.webContents.loadURL(`nexlet-plugin://${id}/${record.manifest.main}`).then(()=>handshake),deadline]).then(()=>{clearTimeout(timer);},error=>{clearTimeout(timer);if(!active.closing)this.fail(active,error instanceof Error?error.message:'加载失败');throw error;});
    void active.loaded.catch(()=>{});return active;
  }
  ready(contentsId:number){this.callers.get(contentsId)?.ready();}
  acknowledge(contentsId:number,sequence:unknown){if(typeof sequence==='number')this.callers.get(contentsId)?.acknowledgements.get(sequence)?.();}
  private emit(active:RunningPlugin,event:string,value:unknown):Promise<void>{
    if(active.disposed||active.view.webContents.isDestroyed())return Promise.resolve();
    return new Promise(resolve=>{
      const sequence=++active.sequence;
      const finish=()=>{clearTimeout(timer);active.acknowledgements.delete(sequence);resolve();};
      const timer=setTimeout(finish,250);active.acknowledgements.set(sequence,finish);
      active.view.webContents.send('plugin-lifecycle',{event,value,sequence});
    });
  }
  private attach(active:RunningPlugin,owner:BrowserWindow,detached:boolean){
    active.owner=owner;active.detached=detached;owner.contentView.addChildView(active.view);
    const resize=()=>this.layout(active);
    const closed=()=>this.dispose(active,true);
    const close=(event:Electron.Event)=>{if(detached&&!active.closing){event.preventDefault();void this.stop(active.record.manifest.id);}};
    owner.on('resize',resize);owner.on('closed',closed);owner.on('close',close);owner.webContents.on('zoom-changed',resize);owner.webContents.once('destroyed',closed);owner.webContents.on('render-process-gone',closed);
    active.removeOwnerListeners=()=>{owner.removeListener('resize',resize);owner.removeListener('closed',closed);owner.removeListener('close',close);if(!owner.webContents.isDestroyed()){owner.webContents.removeListener('zoom-changed',resize);owner.webContents.removeListener('destroyed',closed);owner.webContents.removeListener('render-process-gone',closed);}};
    this.layout(active);this.host!.changed(owner);
  }
  private layout(active:RunningPlugin){
    if(active.disposed||active.owner.isDestroyed())return;
    const [width,height]=active.owner.getContentSize(),top=Math.round(58*active.owner.webContents.getZoomFactor());
    active.view.setBounds({x:1,y:top,width:Math.max(1,width-2),height:Math.max(1,height-top-1)});
    active.view.setVisible(!this.suspended&&!this.overlays.has(active.owner.id));
  }
  overlay(owner:BrowserWindow,visible:boolean){if(visible)this.overlays.add(owner.id);else this.overlays.delete(owner.id);const active=this.forWindow(owner);if(active)this.layout(active);}
  suspend(visible:boolean){this.suspended=visible;for(const active of this.sessions.values())this.layout(active);}
  async detach(owner:BrowserWindow):Promise<void>{
    const active=this.forWindow(owner);if(!active||active.detached||active.closing||this.detaching.has(active.record.manifest.id))return;
    this.detaching.add(active.record.manifest.id);
    try{await active.loaded;}catch(e){this.detaching.delete(active.record.manifest.id);throw e;}if(active.closing){this.detaching.delete(active.record.manifest.id);return;}
    const target=this.host!.createDetached();
    try{
      await new Promise<void>((resolve,reject)=>{
        const loaded=()=>finish(),failed=()=>finish(new Error('独立窗口加载失败')),closed=()=>finish(new Error('独立窗口已关闭'));
        const timer=setTimeout(()=>finish(new Error('独立窗口加载超时')),8000);
        const finish=(error?:Error)=>{clearTimeout(timer);if(!target.webContents.isDestroyed()){target.webContents.removeListener('did-finish-load',loaded);target.webContents.removeListener('did-fail-load',failed);}target.removeListener('closed',closed);error?reject(error):resolve();};
        if(!target.webContents.isLoading())finish();else{target.webContents.once('did-finish-load',loaded);target.webContents.once('did-fail-load',failed);target.once('closed',closed);}
      });
      if(active.closing||owner.isDestroyed()||target.isDestroyed())throw new Error('插件分离已取消');
      active.removeOwnerListeners();owner.contentView.removeChildView(active.view);
      this.attach(active,target,true);this.host!.changed(owner);
      await this.emit(active,'detach',undefined);if(active.closing)return;
      revealWindow(target);active.view.webContents.focus();
    }catch(error){if(!target.isDestroyed())target.destroy();throw error;}finally{this.detaching.delete(active.record.manifest.id);}
  }
  async exitWindow(owner:BrowserWindow){if(owner===this.host?.main()){this.navigation++;for(const controller of this.preparing.values())controller.abort();}const active=this.forWindow(owner);if(active)await this.stop(active.record.manifest.id);}
  async stop(id:string,notify=true):Promise<void>{
    this.epochs.set(id,(this.epochs.get(id)||0)+1);
    this.preparing.get(id)?.abort();
    const active=this.sessions.get(id);if(!active||active.closing)return;
    active.closing=true;this.sessions.delete(id);
    this.releaseSession(active.view.webContents.id);
    if(!active.owner.isDestroyed()){active.owner.contentView.removeChildView(active.view);if(notify)this.host?.changed(active.owner);}
    active.rejectReady(new Error('插件启动已取消'));
    if(active.activated)await this.emit(active,'out',inputContext(active.input,active.code));
    this.dispose(active,notify);
  }
  private fail(active:RunningPlugin,message:string){if(active.closing||active.disposed)return;this.dispose(active,true);this.host?.error(`插件「${active.record.manifest.name}」${message}`);}
  private dispose(active:RunningPlugin,notify:boolean){
    if(active.disposed)return;active.disposed=true;active.closing=true;active.rejectReady(new Error('插件已关闭'));
    if(this.sessions.get(active.record.manifest.id)===active)this.sessions.delete(active.record.manifest.id);
    active.removeOwnerListeners();this.overlays.delete(active.owner.id);
    if(!active.owner.isDestroyed())active.owner.contentView.removeChildView(active.view);
    for(const finish of active.acknowledgements.values())finish();
    // Capture ID before closing: Electron no longer exposes it after destruction.
    for(const [id,caller] of this.callers)if(caller===active){this.callers.delete(id);this.inputs.revoke(id);this.releaseSession(id);}
    if(!active.view.webContents.isDestroyed())active.view.webContents.close({waitForBeforeUnload:false});
    void active.isolated.clearStorageData().catch(()=>{});
    if(active.detached&&!active.owner.isDestroyed())active.owner.destroy();
    else if(notify&&!active.owner.isDestroyed())this.host?.changed(active.owner);
  }
  async close(){this.navigation++;for(const controller of this.preparing.values())controller.abort();await Promise.all([...this.sessions.keys()].map(id=>this.stop(id)));}
}
