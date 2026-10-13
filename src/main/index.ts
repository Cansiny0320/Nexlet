import { launchLinuxApplication } from './linux-desktop';
import { LINUX_DESKTOP_NAME } from './linux-startup';
import { ToolHandoffs } from './tool-handoff';
import { createUpdateTransport } from './update-transport';
import { AppUpdates, UpdateSaveBarrier } from './updater';
import { app, BrowserWindow, Menu, Tray, nativeImage, nativeTheme, globalShortcut, ipcMain, clipboard, ClipboardItem, dialog, shell, screen, protocol } from 'electron';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { copyFile, writeFile } from 'node:fs/promises';
import { launchWindowsApplication } from './launch-windows';
import path from 'node:path';
import { isHostDocument } from './host-origin';
import { Store } from './store';
import { Catalog } from './catalog';
import { release } from 'node:os';
import { SystemActions } from './system-actions';
import { createSystemExecutor } from './system-executor';
import { Platform } from './platform';
import { ClipboardService } from './clipboard';
import { PluginManager } from './plugins';
import { LaunchInputs } from './launch-input';
import { ContentMatcher } from './content-matcher';
import { INPUT_TEXT_LIMIT } from '../shared/launch';
import { Marketplace } from './marketplace';
import { EverythingSearch } from './everything';
import { StartupManager } from './startup';
import { revealWindow, focusOnRestore } from './window-visibility';
import { BUILTIN_COMMANDS, HOST_ACTIONS, type AppState, type Settings, type Command, type Scratchpad } from '../shared/types';
import { searchCommands } from '../shared/search';
import { calculate } from '../shared/calculator';

const testMode = process.env.NEXLET_TEST_MODE === '1';
if (process.env.NEXLET_USER_DATA) { const directory=path.resolve(process.env.NEXLET_USER_DATA); mkdirSync(directory,{recursive:true}); app.setPath('userData',directory); }
protocol.registerSchemesAsPrivileged([{scheme:'nexlet-plugin',privileges:{standard:true,secure:true,supportFetchAPI:true}},{scheme:'nexlet-image',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
if(testMode)app.commandLine.appendSwitch('force-device-scale-factor','1');
app.setName('Nexlet');
if(process.platform==='linux')app.setDesktopName(LINUX_DESKTOP_NAME);
if (!app.requestSingleInstanceLock()) app.quit();
else void bootstrap();

async function bootstrap() {
  await app.whenReady();
  app.setAppUserModelId('app.nexlet.desktop');
  const store=new Store(app.getPath('userData'));
  let main: BrowserWindow;
  let quitting=false, shortcutError:string|null=null, tray:Tray|null=null, modalCount=0;
  const hosts=new Map<number,BrowserWindow>(), views=new Map<number,string>(), boards=new Map<number,string[]>();
  const html=path.join(__dirname,'../renderer/index.html');
  const notify=(event='state')=>{for(const window of hosts.values())if(!window.isDestroyed())window.webContents.send('host-change',event);};
  const platform=new Platform(()=>main?.getNativeWindowHandle());
  const clips=new ClipboardService(store,platform,()=>notify('clips'));
  const catalog=new Catalog(()=>notify());
  const systemExecutor=createSystemExecutor();
  if(testMode)systemExecutor.execute=async()=>{throw Error('测试模式禁止真实系统操作');};
  const systemActions=new SystemActions(process.platform,release(),systemExecutor);
  const inputs=new LaunchInputs(bytes=>{const image=nativeImage.createFromBuffer(bytes);return image.isEmpty()?{width:0,height:0}:image.getSize();});
  const matcher=new ContentMatcher();
  const plugins=new PluginManager(store,notify,inputs,platform);
  const marketplace=new Marketplace(store,plugins);
  plugins.updateOnLaunch=(record,code,signal)=>marketplace.prepareUpdate(record,code,signal);
  const files=new EverythingSearch(()=>store.settings().fileSearchPaths);
  const startup=new StartupManager(app,process.platform,process.execPath,process.env.PORTABLE_EXECUTABLE_FILE);
  const loginLaunch=startup.wasOpenedAtLogin(process.argv);
  const updateMode = !app.isPackaged || testMode || !['darwin','win32','linux'].includes(process.platform) ? 'unsupported' : process.env.PORTABLE_EXECUTABLE_FILE || (process.platform==='linux'&&!process.env.APPIMAGE) ? 'portable' : 'automatic';
  const updateTransport = updateMode === 'automatic' || (testMode && app.isPackaged) ? createUpdateTransport() : null;
  if(updateTransport){updateTransport.autoDownload=false;updateTransport.autoInstallOnAppQuit=false;updateTransport.allowPrerelease=false;updateTransport.allowDowngrade=false;}
  const updateSaves = new UpdateSaveBarrier();
  const updates = new AppUpdates(app.getVersion(),updateMode,updateTransport,()=>{if(updates.read().phase==='error')quitting=false;notify();},async()=>{await updateSaves.prepare([...hosts.keys()],(id,token)=>hosts.get(id)?.webContents.send('host-change','update:prepare:'+token));quitting=true;});
  const iconFile=path.join(__dirname,'../../assets/icon.png');
  const appIcon=existsSync(iconFile)?nativeImage.createFromPath(iconFile):createIcon();
  protocol.handle('nexlet-image',request=>{
    const url=new URL(request.url);
    if(url.hostname!=='local' || !/^\/[a-f0-9]{64}\.png$/.test(url.pathname))return new Response('Not found',{status:404});
    try{return new Response(readFileSync(path.join(store.images,url.pathname.slice(1))),{headers:{'Content-Type':'image/png'}});}catch{return new Response('Not found',{status:404});}
  });
  const toolHandoffs=new ToolHandoffs();
  function createWindow(view='launcher', detached=false, ids:string[]=[], initiallyHidden=false, transfer='') {
    const window=new BrowserWindow({width:800,height:view==='launcher'?310:600,minWidth:640,minHeight:260,show:false,frame:false,roundedCorners:true,resizable:true,backgroundColor:'#f4f4f4',title:detached?`Nexlet · ${view==='clipboard'?'剪贴板':view==='scratchpad'?'计算稿纸':'工具'}`:'Nexlet',icon:appIcon,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'../preload/host.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webviewTag:false,spellcheck:false}});
    hosts.set(window.webContents.id,window); views.set(window.id,view);
    if(ids.length)boards.set(window.webContents.id,ids);
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',event=>event.preventDefault());
    window.webContents.on('will-attach-webview',event=>event.preventDefault());
    const contentsId=window.webContents.id, windowId=window.id;
    focusOnRestore(window);
    window.once('ready-to-show',()=>{if(!initiallyHidden)revealWindow(window);});
    window.on('close',event=>{if(!detached && !quitting){event.preventDefault();window.hide();}});
    window.on('closed',()=>{toolHandoffs.forget(contentsId);hosts.delete(contentsId);views.delete(windowId);boards.delete(contentsId);files.forget(contentsId);inputs.forget(contentsId);matcher.cancel(contentsId);});
    window.on('blur',()=>{if(!detached && !testMode && !modalCount && store.settings().hideOnBlur && views.get(window.id)==='launcher')window.hide();});
    window.on('unresponsive',()=>notify('error:界面暂时无响应，请等待或从托盘重新打开'));
    void window.loadFile(html,{query:{view,detached:detached?'1':'0',board:ids.length?'1':'0',transfer}});
    if(detached)window.center();
    return window;
  }
  function position() {const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;const bounds=main.getBounds();main.setPosition(Math.round(area.x+(area.width-bounds.width)/2),Math.round(area.y+Math.max(25,(area.height-bounds.height)*0.3)));}
  async function show() {await platform.rememberTarget();if(main.isMinimized())main.restore();position();revealWindow(main);main.webContents.send('host-change','focus');notify();}
  function registerShortcut() {
    if(testMode)return;
    globalShortcut.unregisterAll();
    const accelerator=store.settings().shortcut;
    try {shortcutError=globalShortcut.register(accelerator,()=>{if(main.isVisible() && main.isFocused())main.hide();else void show();})?null:`${accelerator} 已被其他应用占用，可在设置中改为 Ctrl+Alt+Space`;}
    catch{shortcutError='快捷键格式无效，请在设置中修改';}
    notify();
  }
  async function state():Promise<AppState> {
    const settings=store.settings();
    const commands:Command[]=[...BUILTIN_COMMANDS,...catalog.items,...systemActions.commands(),...plugins.commands(),...settings.webShortcuts.map(w=>({id:'web:'+w.id,name:w.name,subtitle:w.url,kind:'web' as const,keywords:[],color:'#3188ef'}))];
    const pinned=catalog.resolveIds(store.get('pinned',['tool:plugins','tool:clipboard','tool:scratchpad','tool:web','tool:json','tool:timestamp','tool:filesearch']));
    const recent=catalog.resolveIds(store.get<string[]>('recent',[]));
    const visibleIds=new Set([...pinned,...recent.slice(0,18)]);
    const decorated=await catalog.withIcons(commands.filter(c=>visibleIds.has(c.id)));
    const icons=new Map(decorated.map(c=>[c.id,c.icon]));
    return {update:updates.read(),version:app.getVersion(),platform:process.platform,settings,startup:startup.read(),pinned,recent,commands:commands.map(c=>({...c,icon:icons.get(c.id)||c.icon})),plugins:plugins.records(),shortcutError,catalogLoading:catalog.loading,nativeStatus:platform.status||clips.error,canPaste:!!platform.target};
  }
  function recordRecent(id:string) {store.set('recent',[id,...store.get<string[]>('recent',[]).filter(v=>v!==id)].slice(0,60));notify();}
  async function withDialog<T>(callback:()=>Promise<T>):Promise<T>{modalCount++;plugins.runtime.suspend(true);try{return await callback();}finally{modalCount--;plugins.runtime.suspend(modalCount>0);}}
  function inputObject(payload:unknown):Record<string,any>{if(!payload || typeof payload!=='object' || Array.isArray(payload))throw new Error('参数无效');return payload as Record<string,any>;}
  function text(value:unknown,max=1000):string{if(typeof value!=='string'||value.length>max)throw new Error('文本参数无效');return value;}
  function ids(value:unknown):string[]{if(!Array.isArray(value)||value.length>256||value.some(v=>typeof v!=='string'||v.length>150))throw new Error('记录列表无效');return value;}
  function imageData(value:unknown):Buffer {const data=text(value,28*1024*1024);if(!data.startsWith('data:image/png;base64,'))throw new Error('仅支持 PNG 图片');const buffer=Buffer.from(data.slice(22),'base64');if(buffer.length>20*1024*1024||!buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('图片数据无效或超过 20 MB');return buffer;}
  async function writeImage(data:unknown){await clipboard.write([new ClipboardItem({'image/png':new Blob([new Uint8Array(imageData(data))],{type:'image/png'})})]);}
  ipcMain.handle('host-api',async(event,action:unknown,payload:unknown)=>{
    const window=hosts.get(event.sender.id);
    if(!window||event.senderFrame!==event.sender.mainFrame||!isHostDocument(event.senderFrame.url,html)||!HOST_ACTIONS.includes(action as any))throw new Error('不允许的调用来源');
    switch(action){
      case 'state':return state();
      case 'catalogIcons':{
        if(!Array.isArray(payload)||payload.length>64||payload.some(id=>typeof id!=='string'||id.length>250))throw new Error('应用列表无效');
        const requested=new Set(payload);
        return (await catalog.withIcons([...catalog.items,...systemActions.commands()].filter(item=>requested.has(item.id)))).map(({id,icon})=>({id,icon}));
      }
      case 'pluginSession':return plugins.runtime.state(window);
      case 'updateReady':{const args=inputObject(payload);updateSaves.ready(event.sender.id,args.token,args.error);return true;}
      case 'updateCheck':await updates.check();return updates.read();
      case 'updateDownload':await updates.download();return updates.read();
      case 'updateInstall':await updates.install();return true;
      case 'updatePortable':await shell.openExternal(updates.downloadUrl());return true;
      case 'search':{
        if(typeof payload==='string'){const current=await state();return catalog.withIcons(searchCommands(current.commands,text(payload,1024),current.recent));}
        const args=inputObject(payload),query=text(args.query,INPUT_TEXT_LIMIT);
        const input=args.inputId?inputs.get(event.sender.id,args.inputId).input:inputs.setText(event.sender.id,query,args.from==='paste'?'paste':'input');
        const current=await state();
        inputs.get(event.sender.id,input.id);
        const result=await matcher.search(event.sender.id,current.commands,input,query,current.recent);
        result.results=await catalog.withIcons(result.results);return result;
      }
      case 'launchInput':matcher.cancel(event.sender.id);return inputs.capture(event.sender.id,payload);
      case 'clearInput':matcher.cancel(event.sender.id);inputs.clear(event.sender.id);return true;
      case 'launch':{
        const args=inputObject(payload), id=text(args.id,250); const current=await state();
        const snapshot=args.inputId?inputs.get(event.sender.id,args.inputId):undefined;
        const content=snapshot?.input.type==='text'?snapshot.input.text:typeof args.payload==='string'?text(args.payload,INPUT_TEXT_LIMIT):'';
        if(id==='input:url'){const url=new URL(text(content.trim(),2048));if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('链接无效');await shell.openExternal(url.href);window.hide();return {opened:true};}
        if(id==='match:collect'){
          if(!snapshot||snapshot.input.type==='text')throw new Error('请选择图片或文件输入');
          if(snapshot.input.type==='image'){const bytes=await inputs.readResource(snapshot,snapshot.input.image.id);await clipboard.write([new ClipboardItem({'image/png':new Blob([new Uint8Array(bytes)],{type:'image/png'})})]);}
          else{for(const resource of snapshot.input.files){if(!existsSync(resource.path!))throw new Error('输入文件已移动或不存在');if(!resource.isDirectory)await inputs.readResource(snapshot,resource.id);}const paths=snapshot.input.files.map(f=>f.path!);await platform.writeFiles(paths);const copied=await platform.readFiles();if(paths.some(file=>!copied.includes(file)))throw new Error('系统未接受文件剪贴板，输入已保留，请重试');}
          await clips.capture(true);if(clips.error)throw Error(clips.error);return {view:'clipboard'};
        }
        if(['match:calc','match:json','match:clipboard'].includes(id)){
          if(!snapshot||snapshot.input.type!=='text')throw new Error('请选择文本输入');
          const view=id==='match:calc'?'scratchpad':id==='match:json'?'json':'clipboard';
          recordRecent('tool:'+view);return {view,payload:content};
        }
        const command=current.commands.find(c=>c.id===id);if(!command)throw new Error('工具或快捷方式已不存在，请刷新索引');
        if(command.kind==='system'){
          try {
            const opened=await systemActions.launch(id,c=>withDialog(async()=>{
              const {response}=await dialog.showMessageBox(window,{type:'question',buttons:['取消',c.name],defaultId:0,cancelId:0,noLink:true,title:'系统操作',message:`确定要执行「${c.name}」吗？`,detail:c.id==='system:action:sleep'?'电脑将进入睡眠状态。':'请先保存正在编辑的内容。'});
              return response===1;
            }));
            if(opened){recordRecent(id);window.hide();}
            return {opened};
          } catch(error){revealWindow(window);throw error;}
        }
        if(command.kind==='tool'){await plugins.runtime.exitWindow(window);recordRecent(id);return {view:id.slice(5)};}
        if(command.kind==='plugin'){if(args.mode==='open'&&plugins.runtime.focus(command.pluginId!,command.feature!)){recordRecent(id);return {opened:true};}await plugins.launch(command.pluginId!,command.feature!,content,snapshot);recordRecent(id);return {opened:true};}
        if(command.kind==='web'){const entry=current.settings.webShortcuts.find(w=>'web:'+w.id===id);if(!entry)throw new Error('网页不存在');await shell.openExternal(entry.url);}
        else if(process.platform==='linux'&&id.startsWith('linux-app:')&&command.path){await launchLinuxApplication(command.path);}
        else if(id.startsWith('uwp:')){launchWindowsApplication(id.slice(4));}
        else if(command.path){const error=await shell.openPath(command.path);if(error)throw new Error(error);}
        recordRecent(id);window.hide();return {opened:true};
      }
      case 'pin':{const id=text(payload,250);const current=await state();if(!current.commands.some(c=>c.id===id))throw new Error('功能不存在');const old=current.pinned;store.set('pinned',old.includes(id)?old.filter(v=>v!==id):[...old,id]);notify();return true;}
      case 'toolSession':{const args=inputObject(payload),token=text(args.token,100);if(args.action==='read')return toolHandoffs.read(event.sender.id,token);if(args.action==='ready'){toolHandoffs.acknowledge(event.sender.id,token,args.error?text(args.error,1000):undefined);return true;}throw Error('交接操作无效');}
      case 'window':{
        const args=inputObject(payload);
        if(args.action==='pluginSearch'){if(args.operation==='read')return plugins.sdk.commands?.read(window)??null;return plugins.sdk.commands?.input(window,args.text,args.operation==='select'?args.id:undefined);}
        if(args.action==='exitPlugin')await plugins.runtime.exitWindow(window);
        else if(args.action==='overlay')plugins.runtime.overlay(window,args.visible===true);
        else if(args.action==='hide')window.hide();
        else if(args.action==='close'){if(window===main)window.hide();else window.close();}
        else if(args.action==='minimize')window.minimize();
        else if(args.action==='maximize'){window.isMaximized()?window.unmaximize():window.maximize();}
        else if(args.action==='pin'){window.setAlwaysOnTop(!window.isAlwaysOnTop());return window.isAlwaysOnTop();}
        else if(args.action==='view'){
          const view=text(args.view,50);if(!['launcher','plugin','clipboard','scratchpad','plugins','settings','web','json','timestamp','encoding','uuid','filesearch'].includes(view))throw new Error('视图无效');
          views.set(window.id,view);
          if(!window.isMaximized()){const bounds=window.getBounds();const work=screen.getDisplayMatching(bounds).workArea;const height=Math.min(view==='launcher'?310:600,work.height);window.setBounds({...bounds,height,y:Math.min(bounds.y,work.y+work.height-height)});}
        }else if(args.action==='height'&&views.get(window.id)==='launcher'){
          const height=Math.max(270,Math.min(720,Number(args.height)||310));const bounds=window.getBounds();const work=screen.getDisplayMatching(bounds).workArea;window.setBounds({...bounds,height:Math.min(height,work.height),y:Math.min(bounds.y,work.y+work.height-Math.min(height,work.height))});
        }else if(args.action==='detach'){const view=text(args.view,50);if(view==='plugin'){await plugins.runtime.detach(window);return true;}if(!['clipboard','scratchpad','json','timestamp','encoding','uuid','filesearch'].includes(view))throw new Error('此视图不能分离');if(views.get(window.id)!==view||args.snapshot?.view!==view)throw Error('工具视图已改变');await toolHandoffs.transfer(event.sender.id,args.snapshot,token=>{const target=createWindow(view,true,[],true,token);return {id:target.webContents.id,show:()=>revealWindow(target),destroy:()=>{if(!target.isDestroyed())target.destroy();}};});}
        return true;
      }
      case 'settings':{
        const update=inputObject(payload), settings=store.settings();
        const next:Settings={...settings};
        if('shortcut'in update)next.shortcut=text(update.shortcut,80);
        if('theme'in update){if(!['light','dark','system'].includes(update.theme))throw new Error('主题无效');next.theme=update.theme;}
        for(const key of ['hideOnBlur','clipboardEnabled','autoCheckUpdates'] as const)if(key in update){if(typeof update[key]!=='boolean')throw new Error('开关无效');next[key]=update[key];}
        for(const key of ['maxClipboardItems','retentionDays'] as const)if(key in update){const n=update[key];if(!Number.isInteger(n)||n<1||n>(key==='retentionDays'?3650:5000))throw new Error('保留数量或天数无效');next[key]=n;}
        if('searchPaths'in update){if(!Array.isArray(update.searchPaths)||update.searchPaths.length>20||update.searchPaths.some((p:unknown)=>typeof p!=='string'||!path.isAbsolute(p)))throw new Error('搜索路径无效');next.searchPaths=update.searchPaths;}
        if('fileSearchPaths'in update){if(!Array.isArray(update.fileSearchPaths)||update.fileSearchPaths.length>26||update.fileSearchPaths.some((p:unknown)=>typeof p!=='string'||!path.isAbsolute(p)||/[\0\r\n]/.test(p)))throw new Error('索引目录无效');next.fileSearchPaths=[...new Set(update.fileSearchPaths)] as string[];await files.reset();}
        if('webShortcuts'in update){if(!Array.isArray(update.webShortcuts)||update.webShortcuts.length>100)throw new Error('网页快捷方式过多');next.webShortcuts=update.webShortcuts.map((w:any)=>{const id=text(w.id,100),name=text(w.name,60).trim();const url=new URL(text(w.url,2048));if(!name||!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('名称或网页地址无效');return{id,name,url:url.href};});}
        store.set('settings',next);updates.setAutomaticChecks(next.autoCheckUpdates);nativeTheme.themeSource=next.theme;if(next.shortcut!==settings.shortcut)registerShortcut();if(JSON.stringify(next.searchPaths)!==JSON.stringify(settings.searchPaths))void catalog.scan(next.searchPaths);store.prune();notify();notify('clips');return next;
      }
      case 'rescan':await catalog.scan(store.settings().searchPaths);return true;
      case 'startup':{if(typeof payload!=='boolean')throw new Error('自启动开关无效');const result=startup.set(payload);notify();return result;}
      case 'pickSearchPath':return withDialog(async()=>{const result=await dialog.showOpenDialog(window,{properties:['openDirectory'],title:'选择应用或快捷方式目录'});return result.canceled?null:result.filePaths[0];});
      case 'clips':{const args=payload?inputObject(payload):{};const query=typeof args.query==='string'?args.query.slice(0,1024):'';const kind=typeof args.kind==='string'?args.kind:'all';const board=boards.get(event.sender.id);return store.clips(query,kind).filter(i=>!board||board.includes(i.id));}
      case 'clipAction':{
        const args=inputObject(payload), operation=text(args.action,30);
        if(operation==='writeText'){await clipboard.writeText(text(args.text,2*1024*1024));return true;}
        if(operation==='writeImage'){await writeImage(args.data);return true;}
        if(operation==='writeFiles'){const files=args.files;if(!Array.isArray(files)||!files.length||files.length>256||files.some(p=>typeof p!=='string'||!path.isAbsolute(p)||!existsSync(p)))throw new Error('文件已移动或不存在');await platform.writeFiles(files);return true;}
        if(operation==='saveImage'){const data=imageData(args.data);return withDialog(async()=>{const result=await dialog.showSaveDialog(window,{defaultPath:'Nexlet-image.png',filters:[{name:'PNG 图片',extensions:['png']}]});if(result.canceled||!result.filePath)return false;await writeFile(result.filePath,data);return true;});}
        if(operation==='capture'){await clips.capture(true);return true;}
        if(operation==='clear'){store.deleteClips(store.clips().filter(i=>args.includeFavorites===true||!i.favorite).map(i=>i.id));notify('clips');return true;}
        const selected=ids(args.ids);
        if(operation==='copy')await clips.copy(selected);
        else if(operation==='paste'){await clips.copy(selected);window.hide();try{await platform.paste();}catch(error){window.show();throw error;}}
        else if(operation==='delete'){store.deleteClips(selected);notify('clips');}
        else if(operation==='favorite'){if(typeof args.value!=='boolean')throw new Error('收藏值无效');for(const id of selected)store.favorite(id,args.value);notify('clips');}
        else if(operation==='station'){const popup=createWindow('clipboard',true,selected);popup.setAlwaysOnTop(true);}
        else if(operation==='save'){const item=selected.length===1?store.clip(selected[0]):undefined;if(!item?.imagePath)throw new Error('请选择一张图片');return withDialog(async()=>{const result=await dialog.showSaveDialog(window,{defaultPath:'Nexlet-clipboard.png',filters:[{name:'PNG 图片',extensions:['png']}]});if(result.canceled||!result.filePath)return false;await copyFile(item.imagePath!,result.filePath);return true;});}
        else throw new Error('操作无效');
        return true;
      }
      case 'pads':return store.pads();
      case 'savePad':{
        const args=inputObject(payload), pad=inputObject(args.pad) as unknown as Scratchpad;
        if(!/^[a-zA-Z0-9-]{1,80}$/.test(pad.id)||typeof pad.name!=='string'||pad.name.length>100||typeof pad.locked!=='boolean'||!/^#[a-fA-F0-9]{6}$/.test(pad.color)||!Array.isArray(pad.lines)||pad.lines.length>1000)throw new Error('稿纸数据无效');
        if(pad.lines.some(line=>typeof line.id!=='string'||line.id.length>80||typeof line.expression!=='string'||line.expression.length>512||typeof line.note!=='string'||line.note.length>1000))throw new Error('公式或备注过长');
        const pads=store.pads(),old=pads.find(p=>p.id===pad.id);
        if(old&&args.expectedUpdatedAt!==old.updatedAt)throw new Error('稿纸已在其他窗口修改，请重新打开后再编辑');
        if(old?.locked&&JSON.stringify(old.lines)!==JSON.stringify(pad.lines))throw new Error('稿纸已锁定');
        const saved={...pad,createdAt:old?.createdAt||Date.now(),updatedAt:Math.max(Date.now(),(old?.updatedAt||0)+1)};
        const next=old?pads.map(p=>p.id===saved.id?saved:p):[saved,...pads];if(next.length>500)throw new Error('最多保存 500 份稿纸');
        store.set('pads',next);notify('pads');return saved;
      }
      case 'deletePad':{const id=text(payload,80),pads=store.pads();if(pads.find(p=>p.id===id)?.locked)throw new Error('请先解锁稿纸');store.set('pads',pads.filter(p=>p.id!==id));notify('pads');return true;}
      case 'exportPad':await writeImage(inputObject(payload).data);return true;
      case 'pluginInstall':return withDialog(()=>plugins.install(window,inputObject(payload).development===true));
      case 'pluginToggle':{const args=inputObject(payload);if(typeof args.enabled!=='boolean')throw new Error('状态无效');await plugins.toggle(text(args.id,100),args.enabled);return true;}
      case 'pluginRemove':{const args=inputObject(payload);await plugins.remove(text(args.id,100),args.deleteData===true);return true;}
      case 'pluginInspect':return plugins.records();
      case 'marketplace':return marketplace.list(payload===true);
      case 'marketInstall':return withDialog(()=>marketplace.install(window,text(payload,100)));
      case 'fileSearch':return files.search(event.sender.id,text(payload,1024));
      case 'fileSearchStatus':return files.status();
      case 'fileBrowse':{const args=inputObject(payload);return files.browse(event.sender.id,text(args.path,32767),text(args.filter??'',1024),typeof args.cursor==='string'?text(args.cursor,100):undefined);}
      case 'fileInfo':return files.info(event.sender.id,text(payload,32767));
      case 'fileAction':{const args=inputObject(payload);return files.action(event.sender.id,text(args.action,30),typeof args.path==='string'?text(args.path,32767):undefined);}
      case 'openData':{const error=await shell.openPath(store.directory);if(error)throw new Error(error);return true;}
      default:throw new Error('未知操作');
    }
  });
  main=createWindow('launcher',false,[],loginLaunch);position();nativeTheme.themeSource=store.settings().theme;
  plugins.runtime.configure({main:()=>main,createDetached:()=>createWindow('plugin',true,[],true),changed:owner=>{if(!owner.isDestroyed()){const current=plugins.runtime.state(owner);views.set(owner.id,current?'plugin':'launcher');owner.webContents.send('host-change','plugin-changed');}},error:message=>notify('error:'+message)});
  if(!testMode){
    tray=new Tray(appIcon.resize({width:20,height:20}));tray.setToolTip('Nexlet');
    tray.setContextMenu(Menu.buildFromTemplate([{label:'打开 Nexlet',click:()=>void show()},{label:'剪贴板',click:()=>{void show();main.webContents.send('host-change','navigate:clipboard');}},{label:'计算稿纸',click:()=>{void show();main.webContents.send('host-change','navigate:scratchpad');}},{type:'separator'},{label:'退出 Nexlet',click:()=>{quitting=true;app.quit();}}]));
    tray.on('click',()=>void show()); registerShortcut(); clips.start();
  }
  void catalog.scan(store.settings().searchPaths);
  app.on('second-instance',()=>void show()); app.on('activate',()=>void show());
  app.on('window-all-closed',()=>{});
  let cleanedUp=false;
  app.on('before-quit',event=>{quitting=true;updates.setAutomaticChecks(false);clips.stop();globalShortcut.unregisterAll();matcher.close();if(tray&&!tray.isDestroyed())tray.destroy();if(!cleanedUp){event.preventDefault();cleanedUp=true;void Promise.all([plugins.close(),files.close()]).finally(()=>{inputs.close();app.quit();});}});
  app.once('will-quit',()=>store.close());
  updates.setAutomaticChecks(store.settings().autoCheckUpdates);
  if(testMode)(globalThis as any).__nexlet={updates,autoUpdater:updateTransport,store,clips,platform,catalog,systemActions,systemExecutor,plugins,marketplace,files,main,show,hosts,inputs,matcher,toolHandoffs};
}

function createIcon(){const size=32,data=Buffer.alloc(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const offset=(y*size+x)*4;const letter=(x>=8&&x<=11&&y>=7&&y<=24)||(x>=21&&x<=24&&y>=7&&y<=24)||(y>=7&&y<=24&&Math.abs(x-(9+(y-7)*14/17))<=2);data[offset]=letter?255:245;data[offset+1]=letter?255:94;data[offset+2]=letter?255:101;data[offset+3]=255;}return nativeImage.createFromBitmap(data,{width:size,height:size});}
