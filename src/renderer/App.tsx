import { useState, useEffect, useRef, useCallback } from 'react';
import { Settings as SettingsIcon, Pin, Minus, Square, X, ChevronLeft, ExternalLink, GripVertical } from 'lucide-react';
import type { AppState } from '../shared/types';
import { BUILTIN_COMMANDS } from '../shared/types';
import { AppContext, api, errorText, IconButton, Modal, ToolIcon, type DialogSpec } from './common';
import { Launcher } from './Launcher';
import { ClipboardPanel } from './Clipboard';
import { ScratchpadPanel } from './Scratchpad';
import { ToolsPanel, WebPanel } from './Tools';
import { JsonTool } from './JsonTool';
import { FileSearch } from './FileSearch';
import { PluginsPanel } from './Plugins';
import { SettingsPanel } from './Settings';

const params=new URLSearchParams(location.search);
const detached=params.get('detached')==='1';
const board=params.get('board')==='1';
export function App(){
  const [state,setState]=useState<AppState|null>(null),[loadError,setLoadError]=useState('');
  const [view,setView]=useState(params.get('view')||'launcher'),[query,setQuery]=useState(''),[payload,setPayload]=useState('');
  const [pinned,setPinned]=useState(board),[notification,setNotification]=useState<{text:string;error:boolean}|null>(null);
  const [dialogSpec,setDialogSpec]=useState<DialogSpec|null>(null);
  const resolver=useRef<((r:string|boolean|null)=>void)|null>(null),input=useRef<HTMLInputElement>(null),toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const toast=useCallback((text:string,error=false)=>{setNotification({text,error});if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setNotification(null),error?6500:2500);},[]);
  const refresh=useCallback(async()=>{try{setState(await api<AppState>('state'));}catch(e){setLoadError(errorText(e));}},[]);
  const navigate=useCallback((next:string,initial='')=>{setView(next);setPayload(initial);setQuery(next==='clipboard'?initial:'');},[]);
  const dialog=useCallback((spec:DialogSpec)=>new Promise<string|boolean|null>(resolve=>{resolver.current?.(null);resolver.current=resolve;setDialogSpec(spec);}),[]);
  useEffect(()=>{void refresh();return window.nexlet?.onChange(event=>{if(event==='state')void refresh();if(event==='focus'){input.current?.focus();input.current?.select();}if(event.startsWith('error:'))toast(event.slice(6),true);if(event.startsWith('navigate:'))navigate(event.slice(9));});},[refresh,navigate,toast]);
  useEffect(()=>{void api('window',{action:'view',view}).catch(e=>toast(errorText(e),true));setTimeout(()=>input.current?.focus(),50);},[view,toast]);
  useEffect(()=>{if(!state)return;const media=matchMedia('(prefers-color-scheme: dark)');const apply=()=>document.documentElement.dataset.theme=state.settings.theme==='system'?(media.matches?'dark':'light'):state.settings.theme;apply();media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);},[state?.settings.theme]);
  useEffect(()=>{const handle=(event:KeyboardEvent)=>{
    if(dialogSpec)return;
    if((event.ctrlKey||event.metaKey)&&event.key===','){event.preventDefault();navigate('settings');}
    if(event.key==='Escape'&&!event.defaultPrevented){if(query)setQuery('');else if(view!=='launcher'&&!detached)navigate('launcher');else void api('window',{action:'hide'});}
  };window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);},[view,query,dialogSpec,navigate]);
  const control=async(action:string)=>{try{const value=await api<boolean>('window',{action});if(action==='pin')setPinned(value);}catch(e){toast(errorText(e),true);}};
  const acceptFiles=async(files:File[])=>{
    if(!files.length)return;
    try{
      const paths=files.map(file=>window.nexlet.pathForFile(file)).filter(Boolean);
      if(paths.length===files.length){await api('clipAction',{action:'writeFiles',files:paths});}
      else{const file=files.find(f=>f.type.startsWith('image/'));if(!file)throw new Error('暂不支持此粘贴内容');if(file.size>20*1024*1024)throw new Error('图片超过 20 MB');const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>36_000_000){bitmap.close();throw new Error('图片超过 3600 万像素');}const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d')!.drawImage(bitmap,0,0);bitmap.close();await api('clipAction',{action:'writeImage',data:canvas.toDataURL('image/png')});}
      await api('clipAction',{action:'capture'});navigate('clipboard');toast('已收进剪贴板');
    }catch(e){toast(errorText(e),true);}
  };
  if(!state)return <div className="loading-screen"><span className="brand-mark">N</span><p>{loadError||'正在打开 Nexlet…'}</p>{loadError&&<button className="button" onClick={()=>void refresh()}>重试</button>}</div>;
  const command=BUILTIN_COMMANDS.find(c=>c.id==='tool:'+view);
  return <AppContext.Provider value={{state,refresh,toast,dialog,navigate}}><div className={`app-shell view-${view} ${detached?'detached':''}`} onDragOver={e=>{if(view==='launcher'&&e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}}} onDrop={e=>{if(view==='launcher'){e.preventDefault();void acceptFiles(Array.from(e.dataTransfer.files));}}} onPaste={e=>{if(view==='launcher'&&e.clipboardData.files.length){e.preventDefault();void acceptFiles(Array.from(e.clipboardData.files));}}}>
    <header className="titlebar">
      <div className="window-drag-handle" aria-label="拖动窗口" title="拖动窗口"><GripVertical size={17}/></div>
      {view==='launcher'?<input ref={input} className="launcher-input" aria-label="搜索功能、应用或快捷方式" placeholder="搜索功能 / 粘贴文件、图片" value={query} onChange={e=>setQuery(e.target.value)} autoComplete="off" spellCheck={false}/>:
       view==='clipboard'?<><ToolIcon command={command!}/><input ref={input} className="clipboard-search" aria-label="搜索剪贴板" placeholder="搜索…" value={query} onChange={e=>setQuery(e.target.value)}/>{board&&<span className="subtle">悬浮中转</span>}</>:
       <div className="plugin-pill" title="拖动窗口">{command&&<ToolIcon command={command} size={20}/>}<span>{command?.name||'Nexlet'}</span>{!detached&&<button className="plugin-pill-close" aria-label="关闭当前工具" title="返回首页" onClick={()=>navigate('launcher')}><X size={14}/></button>}</div>}
      <div className="titlebar-spacer"/>
      <div className="window-controls">
        {!detached&&view!=='launcher'&&<IconButton title="返回首页" onClick={()=>navigate('launcher')}><ChevronLeft size={17}/></IconButton>}
        {view!=='launcher'&&view!=='settings'&&view!=='plugins'&&view!=='web'&&!detached&&<IconButton title="分离为独立窗口" onClick={()=>void api('window',{action:'detach',view}).catch(e=>toast(errorText(e),true))}><ExternalLink size={16}/></IconButton>}
        {view!=='launcher'&&<IconButton title="固定窗口" active={pinned} onClick={()=>void control('pin')}><Pin size={16}/></IconButton>}
        {view==='launcher'?<button className="brand-button" title="设置" aria-label="打开设置" onClick={()=>navigate('settings')}><span>N</span>{state.shortcutError&&<i/>}</button>:<><IconButton title="最小化" onClick={()=>void control('minimize')}><Minus size={16}/></IconButton><IconButton title="最大化" onClick={()=>void control('maximize')}><Square size={13}/></IconButton><IconButton title="关闭窗口" onClick={()=>void control('close')}><X size={17}/></IconButton></>}
      </div>
    </header>
    <main className="main-content">
      {view==='launcher'&&<Launcher query={query} setQuery={setQuery} input={input}/>}
      {view==='clipboard'&&<ClipboardPanel query={query} setQuery={setQuery} board={board}/>}
      {view==='scratchpad'&&<ScratchpadPanel initialExpression={payload}/>}
      {view==='json'&&<JsonTool key={payload} initial={payload}/>}
      {view==='filesearch'&&<FileSearch/>}
      {['timestamp','encoding','uuid'].includes(view)&&<ToolsPanel key={view+payload} tool={view} initial={payload}/>}
      {view==='web'&&<WebPanel/>}
      {view==='plugins'&&<PluginsPanel/>}
      {view==='settings'&&<SettingsPanel/>}
    </main>
    {notification&&<div className={`toast ${notification.error?'error':''}`} role="status" onClick={()=>setNotification(null)}>{notification.text}</div>}
    {dialogSpec&&<Modal key={dialogSpec.title} spec={dialogSpec} onResolve={result=>{setDialogSpec(null);resolver.current?.(result);resolver.current=null;}}/>}
  </div></AppContext.Provider>;
}
