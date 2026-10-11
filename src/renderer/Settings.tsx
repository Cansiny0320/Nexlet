import { useState,useEffect } from 'react';
import { Keyboard, Palette, ClipboardList, FolderSearch, FolderOpen, Plus, X, RefreshCw, Monitor } from 'lucide-react';
import { api,useApp,errorText,PanelHeader,IconButton } from './common';
import type { Settings as SettingsType } from '../shared/types';

export function SettingsPanel(){
  const {state,toast}=useApp();const [shortcut,setShortcut]=useState(state.settings.shortcut),[recording,setRecording]=useState(false);
  useEffect(()=>{setShortcut(state.settings.shortcut);},[state.settings.shortcut]);
  const update=async(patch:Partial<SettingsType>)=>{try{await api('settings',patch);toast('设置已保存');}catch(e){toast(errorText(e),true);}};
  const coexist=state.platform==='darwin'?'Control+Alt+Space':'Ctrl+Alt+Space';
  return <div className="standard-panel scroll-panel settings-panel"><PanelHeader title="设置" description="Nexlet · 随叫随到的桌面工具"/>
    <div className="settings-section-title"><Keyboard size={17}/>快捷键与窗口</div>
    <div className="setting-row"><div><strong>全局唤起</strong><p>在任意应用中打开 Nexlet</p></div><div className="shortcut-control"><input aria-label="全局快捷键" value={recording?'按下组合键…':shortcut} readOnly={recording} onChange={e=>setShortcut(e.target.value)} onKeyDown={e=>{if(!recording)return;e.preventDefault();if(['Control','Shift','Alt','Meta'].includes(e.key))return;const keys=[e.ctrlKey?'Control':null,e.metaKey?'Command':null,e.altKey?'Alt':null,e.shiftKey?'Shift':null,e.code==='Space'?'Space':e.key.length===1?e.key.toUpperCase():e.key].filter(Boolean);setShortcut(keys.join('+'));setRecording(false);}}/><button className="button" onClick={()=>setRecording(!recording)}>{recording?'取消':'录制'}</button><button className="button primary" onClick={()=>void update({shortcut})}>保存</button></div></div>
    {state.shortcutError&&<div className="settings-warning">{state.shortcutError}<button className="button" onClick={()=>void update({shortcut:coexist})}>使用 {coexist}</button></div>}
    <div className="setting-row"><div><strong>失焦收起</strong><p>切换到其他应用时收起主搜索框，独立窗口保持显示</p></div><Toggle label="失焦收起" value={state.settings.hideOnBlur} onChange={value=>void update({hideOnBlur:value})}/></div>
    <div className="settings-section-title"><Palette size={17}/>外观</div><div className="setting-row"><div><strong>主题</strong></div><select aria-label="主题" value={state.settings.theme} onChange={e=>void update({theme:e.target.value as SettingsType['theme']})}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></div>
    <div className="settings-section-title"><ClipboardList size={17}/>剪贴板</div><div className="setting-row"><div><strong>记录剪贴板历史</strong><p>仅保存在本机；暂停后仍可查看已有记录</p></div><Toggle label="记录剪贴板历史" value={state.settings.clipboardEnabled} onChange={value=>void update({clipboardEnabled:value})}/></div>
    <div className="setting-row"><div><strong>保留条数</strong><p>超出数量时清理最早的非收藏记录</p></div><select aria-label="保留条数" value={state.settings.maxClipboardItems} onChange={e=>void update({maxClipboardItems:Number(e.target.value)})}>{[100,500,1000,3000,5000].map(n=><option value={n} key={n}>{n} 条</option>)}</select></div>
    <div className="setting-row"><div><strong>保留时间</strong><p>收藏记录不自动清理</p></div><select aria-label="保留天数" value={state.settings.retentionDays} onChange={e=>void update({retentionDays:Number(e.target.value)})}>{[7,30,90,365,3650].map(n=><option value={n} key={n}>{n===3650?'10 年':`${n} 天`}</option>)}</select></div>
    <div className="settings-section-title"><FolderSearch size={17}/>应用和快捷方式搜索</div><p className="setting-description">{state.platform==='win32'?'自动搜索开始菜单、桌面快捷方式与 Windows 应用。':'自动搜索系统和用户 Applications 文件夹。'} 支持中文、拼音和首字母。</p>
    <div className="search-paths">{state.settings.searchPaths.map(folder=><div key={folder}><FolderOpen size={16}/><span title={folder}>{folder}</span><IconButton title={'移除目录 '+folder} onClick={()=>void update({searchPaths:state.settings.searchPaths.filter(p=>p!==folder)})}><X size={15}/></IconButton></div>)}</div>
    <div className="tool-buttons"><button className="button" onClick={async()=>{try{const folder=await api<string|null>('pickSearchPath');if(folder&&!state.settings.searchPaths.includes(folder))await update({searchPaths:[...state.settings.searchPaths,folder]});}catch(e){toast(errorText(e),true);}}}><Plus size={16}/>添加搜索目录</button><button className="button" disabled={state.catalogLoading} onClick={()=>void api('rescan').then(()=>toast('索引已刷新')).catch(e=>toast(errorText(e),true))}><RefreshCw size={16}/>{state.catalogLoading?'正在索引…':'重新扫描'}</button></div>
    {state.nativeStatus&&<div className="settings-warning">{state.nativeStatus}</div>}
    <div className="settings-section-title"><Monitor size={17}/>关于与数据</div><div className="setting-row"><div><strong>Nexlet {state.version}</strong><p>{state.platform==='win32'?'Windows':state.platform==='darwin'?'macOS':state.platform} · 本地存储</p></div><button className="button" onClick={()=>void api('openData').catch(e=>toast(errorText(e),true))}><FolderOpen size={16}/>打开数据目录</button></div>
  </div>;
}
function Toggle({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}){return <button className={`toggle ${value?'on':''}`} role="switch" aria-label={label} aria-checked={value} onClick={()=>onChange(!value)}><i/></button>;}
