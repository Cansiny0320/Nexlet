import { ToolSessionContext,createToolSession } from './tool-session';
import type { ToolSessionSnapshot } from '../shared/tool-session';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Settings as SettingsIcon, Pin, Minus, Square, X, ChevronLeft, ExternalLink, GripVertical } from 'lucide-react';
import type { AppState, PluginSessionState } from '../shared/types';
import { BUILTIN_COMMANDS } from '../shared/types';
import { INPUT_TEXT_LIMIT, type LaunchInput, type InputSource } from '../shared/launch';
import { AppContext, api, errorText, IconButton, Modal, ToolIcon, type DialogSpec } from './common';
import { Launcher } from './Launcher';
import { LaunchInputChip } from './LaunchInputChip';
import { ClipboardPanel } from './Clipboard';
import { ScratchpadPanel } from './Scratchpad';
import { ToolsPanel, WebPanel } from './Tools';
import { JsonTool } from './JsonTool';
import { FileSearch } from './FileSearch';
import { PluginsPanel } from './Plugins';
import { saveBeforeUpdate } from './update-save';
import { SettingsPanel } from './Settings';

const params=new URLSearchParams(location.search);
const detached=params.get('detached')==='1';
const board=params.get('board')==='1';
const transfer=params.get('transfer')||'';
export function App(){
  const [session,setSession]=useState(()=>createToolSession()),[restoring,setRestoring]=useState(!!transfer),[transferring,setTransferring]=useState(false);
  const [state,setState]=useState<AppState|null>(null),[loadError,setLoadError]=useState('');
  const [view,setView]=useState(params.get('view')||'launcher'),[query,setQuery]=useState(''),[payload,setPayload]=useState('');
  const [launchInput,setLaunchInput]=useState<(LaunchInput&{preview?:string})|null>(null),[inputSource,setInputSource]=useState<InputSource>('input');
  const captureGeneration=useRef(0),pluginGeneration=useRef(0),transferDone=useRef(false);
  const [capturing,setCapturing]=useState(false),[pluginInfo,setPluginInfo]=useState<PluginSessionState|null>(null);
  const syncPlugin=useCallback(async()=>{const generation=++pluginGeneration.current;const info=await api<PluginSessionState|null>('pluginSession');if(generation!==pluginGeneration.current)return;setPluginInfo(info);setView(current=>info?'plugin':current==='plugin'?'launcher':current);if(info){setLaunchInput(null);setQuery('');}},[]);
  const [pinned,setPinned]=useState(board),[notification,setNotification]=useState<{text:string;error:boolean}|null>(null);
  const [dialogSpec,setDialogSpec]=useState<DialogSpec|null>(null);
  const resolver=useRef<((r:string|boolean|null)=>void)|null>(null),input=useRef<HTMLInputElement>(null),toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const toast=useCallback((text:string,error=false)=>{setNotification({text,error});if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setNotification(null),error?6500:2500);},[]);
  const refresh=useCallback(async()=>{try{setState(await api<AppState>('state'));}catch(e){setLoadError(errorText(e));}},[]);
  const navigate=useCallback((next:string,initial='')=>{captureGeneration.current++;setCapturing(false);if(next!=='plugin')void api('window',{action:'exitPlugin'});setLaunchInput(null);setSession(createToolSession());setView(next);setPayload(initial);setQuery(next==='clipboard'?initial:'');void api('clearInput');},[]);
  const clearLaunchInput=useCallback(()=>{captureGeneration.current++;setCapturing(false);setLaunchInput(null);setQuery('');setInputSource('input');void api('clearInput');input.current?.focus();},[]);
  const dialog=useCallback((spec:DialogSpec)=>new Promise<string|boolean|null>(resolve=>{resolver.current?.(null);resolver.current=resolve;setDialogSpec(spec);}),[]);
  useEffect(()=>{void refresh();void syncPlugin();return window.nexlet?.onChange(event=>{if(event==='state')void refresh();if(event==='plugin-changed')void syncPlugin();if(event.startsWith('update:prepare:'))void saveBeforeUpdate().then(()=>api('updateReady',{token:event.slice(15)}),error=>api('updateReady',{token:event.slice(15),error:errorText(error)}));if(event==='focus'){input.current?.focus();input.current?.select();}if(event.startsWith('error:'))toast(event.slice(6),true);if(event.startsWith('navigate:'))navigate(event.slice(9));});},[refresh,navigate,toast,syncPlugin]);
  useEffect(()=>{void api('window',{action:'view',view}).catch(e=>toast(errorText(e),true));setTimeout(()=>input.current?.focus(),50);},[view,toast]);
  useEffect(()=>{void api('window',{action:'overlay',visible:!!dialogSpec||(view==='plugin'&&!!notification)});},[dialogSpec,notification,view]);
  useEffect(()=>{if(!state||restoring)return;const media=matchMedia('(prefers-color-scheme: dark)');const apply=()=>document.documentElement.dataset.theme=state.settings.theme==='system'?(media.matches?'dark':'light'):state.settings.theme;apply();media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);},[state?.settings.theme,restoring]);
  useEffect(()=>{const handle=(event:KeyboardEvent)=>{
    if(dialogSpec||transferring||document.querySelector('dialog[open]'))return;
    if((event.ctrlKey||event.metaKey)&&event.key===','){event.preventDefault();navigate('settings');}
    if(event.key==='Escape'&&!event.defaultPrevented){if(query)setQuery('');else if(launchInput)clearLaunchInput();else if(view!=='launcher'&&!detached)navigate('launcher');else void api('window',{action:'hide'});}
  };window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);},[view,query,launchInput,dialogSpec,transferring,navigate,clearLaunchInput]);
  useEffect(()=>{if(!transfer)return;void api<ToolSessionSnapshot>('toolSession',{action:'read',token:transfer}).then(snapshot=>{setSession(createToolSession(snapshot.state));setQuery(snapshot.query);setView(snapshot.view);setRestoring(false);}).catch(e=>{setLoadError(errorText(e));void api('toolSession',{action:'ready',token:transfer,error:errorText(e)});});},[]);
  useEffect(()=>{if(!transfer||restoring||!state||transferDone.current)return;let live=true;const timer=setTimeout(()=>{void Promise.all([...session.restores]).then(()=>{if(live&&!transferDone.current){transferDone.current=true;void api('toolSession',{action:'ready',token:transfer}).catch(()=>{});}},e=>{if(live&&!transferDone.current){transferDone.current=true;void api('toolSession',{action:'ready',token:transfer,error:errorText(e)}).catch(()=>{});}});},50);return()=>{live=false;clearTimeout(timer);};},[session,restoring,!!state]);
  const detachTool=async()=>{if(transferring||detached)return;setTransferring(true);try{if(view==='plugin')await api('window',{action:'detach',view});else{await Promise.all([...session.before].map(save=>save()));await api('window',{action:'detach',view,snapshot:{version:1,view,query,state:session.values}});navigate('launcher');}}catch(e){toast(errorText(e),true);}finally{setTransferring(false);}};
  const control=async(action:string)=>{try{const value=await api<boolean>('window',{action});if(action==='pin')setPinned(value);}catch(e){toast(errorText(e),true);}};
  const acceptFiles=async(files:File[],from:'drop'|'paste')=>{
    if(!files.length)return;
    const generation=++captureGeneration.current;setCapturing(true);
    try{
      const paths=files.map(file=>window.nexlet.pathForFile(file)).filter(Boolean);
      let captured:LaunchInput,preview:string|undefined;
      if(paths.length===files.length){captured=await api('launchInput',{type:'files',paths,from});}
      else{const file=files.find(f=>f.type.startsWith('image/'));if(!file)throw new Error('暂不支持此粘贴内容');if(file.size>20*1024*1024)throw new Error('图片超过 20 MB');const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>36_000_000){bitmap.close();throw new Error('图片超过 3600 万像素');}const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d')!.drawImage(bitmap,0,0);bitmap.close();if(generation!==captureGeneration.current)return;preview=canvas.toDataURL('image/png');captured=await api('launchInput',{type:'image',data:preview,from});}
      if(generation===captureGeneration.current){setLaunchInput({...captured,preview});setQuery('');setInputSource(from);}
    }catch(e){if(generation===captureGeneration.current)toast(errorText(e),true);}finally{if(generation===captureGeneration.current)setCapturing(false);}
  };
  if(!state||restoring)return <div className="loading-screen"><span className="brand-mark">N</span><p>{loadError||'正在打开 Nexlet…'}</p>{loadError&&<button className="button" onClick={()=>void refresh()}>重试</button>}</div>;
  const command=BUILTIN_COMMANDS.find(c=>c.id==='tool:'+view);
  return <ToolSessionContext.Provider value={session}><AppContext.Provider value={{state,refresh,toast,dialog,navigate,detach:detachTool,canDetach:!detached}}><div inert={state.update.phase==='installing'} className={`app-shell view-${view} ${detached?'detached':''}`} onDragOver={e=>{if(view==='launcher'&&e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}}} onDrop={e=>{if(view==='launcher'){e.preventDefault();void acceptFiles(Array.from(e.dataTransfer.files),'drop');}}} onPaste={e=>{if(view!=='launcher')return;if(e.clipboardData.files.length){e.preventDefault();void acceptFiles(Array.from(e.clipboardData.files),'paste');}else if(e.target===input.current){e.preventDefault();const next=query.slice(0,input.current?.selectionStart??0)+e.clipboardData.getData('text/plain')+query.slice(input.current?.selectionEnd??query.length);if(next.length>INPUT_TEXT_LIMIT){toast('输入最多 50 万字符',true);return;}captureGeneration.current++;setCapturing(false);setInputSource('paste');setQuery(next);}}}>
    <header className="titlebar">
      <div className="window-drag-handle" aria-label="拖动窗口" title="拖动窗口"><GripVertical size={17}/></div>
      {view==='launcher'?<>{launchInput&&<LaunchInputChip key={launchInput.id} input={launchInput} preview={launchInput.preview} onClear={clearLaunchInput}/>}<input ref={input} className="launcher-input" aria-label="搜索功能、应用或快捷方式" placeholder={launchInput?'筛选处理功能…':'搜索功能 / 粘贴文件、图片'} maxLength={INPUT_TEXT_LIMIT} value={query} onChange={e=>{captureGeneration.current++;setCapturing(false);setInputSource('input');setQuery(e.target.value);}} autoComplete="off" spellCheck={false}/></>:
       view==='clipboard'?<><ToolIcon command={command!}/><input ref={input} className="clipboard-search" aria-label="搜索剪贴板" placeholder="搜索…" value={query} onChange={e=>setQuery(e.target.value)}/>{board&&<span className="subtle">悬浮中转</span>}</>:
       <div className="plugin-pill" title="拖动窗口">{command&&<ToolIcon command={command} size={20}/>}<span>{view==='plugin'?pluginInfo?.name||'正在打开插件…':command?.name||'Nexlet'}</span>{!detached&&<button className="plugin-pill-close" aria-label="关闭当前工具" title="返回首页" onClick={()=>navigate('launcher')}><X size={14}/></button>}</div>}
      <div className="titlebar-spacer"/>
      <div className="window-controls">
        {!detached&&view!=='launcher'&&<IconButton title="返回首页" onClick={()=>navigate('launcher')}><ChevronLeft size={17}/></IconButton>}
        {view!=='launcher'&&view!=='settings'&&view!=='plugins'&&view!=='web'&&!detached&&<IconButton title="分离为独立窗口" disabled={transferring} onClick={()=>void detachTool()}><ExternalLink size={16}/></IconButton>}
        {view!=='launcher'&&<IconButton title="固定窗口" active={pinned} onClick={()=>void control('pin')}><Pin size={16}/></IconButton>}
        {view==='launcher'?<button className="brand-button" title="设置" aria-label="打开设置" onClick={()=>navigate('settings')}><span>N</span>{state.shortcutError&&<i/>}</button>:<><IconButton title="最小化" onClick={()=>void control('minimize')}><Minus size={16}/></IconButton><IconButton title="最大化" onClick={()=>void control('maximize')}><Square size={13}/></IconButton><IconButton title="关闭窗口" onClick={()=>void control('close')}><X size={17}/></IconButton></>}
      </div>
    </header>
    <main className="main-content" inert={transferring}>
      {view==='launcher'&&<Launcher query={query} setQuery={setQuery} input={input} launchInput={launchInput} source={inputSource} capturing={capturing}/>}
      {view==='clipboard'&&<ClipboardPanel query={query} setQuery={setQuery} board={board}/>}
      {view==='scratchpad'&&<ScratchpadPanel initialExpression={payload}/>}
      {view==='json'&&<JsonTool key={payload} initial={payload}/>}
      {view==='filesearch'&&<FileSearch/>}
      {['timestamp','encoding','uuid'].includes(view)&&<ToolsPanel key={view+payload} tool={view} initial={payload}/>}
      {view==='web'&&<WebPanel/>}
      {view==='plugins'&&<PluginsPanel/>}
      {view==='settings'&&<SettingsPanel/>}
    </main>
    {transferring&&<div className="handoff-overlay" role="status">正在恢复独立窗口…</div>}
    {notification&&<div className={`toast ${notification.error?'error':''}`} role="status" onClick={()=>setNotification(null)}>{notification.text}</div>}
    {dialogSpec&&<Modal key={dialogSpec.title} spec={dialogSpec} onResolve={result=>{setDialogSpec(null);resolver.current?.(result);resolver.current=null;}}/>}
  </div></AppContext.Provider></ToolSessionContext.Provider>;
}
