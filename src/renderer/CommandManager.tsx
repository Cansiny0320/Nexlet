import {useEffect,useState} from 'react';
import {Plus,FolderOpen,Trash2,SlidersHorizontal} from 'lucide-react';
import type {Command} from '../shared/types';
import type {LocalEntry} from '../shared/command-config';
import {api,useApp,errorText,ToolIcon,IconButton} from './common';

export function CommandEditor({command,onClose}:{command:Command;onClose:()=>void}){
  const {state,toast}=useApp(),pref=state.commandConfig.commands[command.id];
  const [aliases,setAliases]=useState((pref?.aliases||[]).join('\n')),[shortcut,setShortcut]=useState(pref?.shortcut||''),[captureSelection,setCaptureSelection]=useState(pref?.captureSelection||false),[disabled,setDisabled]=useState(pref?.disabled||false),[recording,setRecording]=useState(false),[saving,setSaving]=useState(false);
  useEffect(()=>{void api('window',{action:'busy',value:true});return()=>{void api('window',{action:'busy',value:false});};},[]);
  const status=state.shortcutStatuses[command.id];
  const save=async()=>{setSaving(true);try{await api('commandConfig',{action:'patch',id:command.id,patch:{aliases:aliases.split(/[\n,，]/).map(v=>v.trim()).filter(Boolean),shortcut,disabled,captureSelection}});toast('功能设置已保存');onClose();}catch(e){toast(errorText(e),true);}finally{setSaving(false);}};
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)onClose();}}><form className="modal command-editor" onSubmit={e=>{e.preventDefault();void save();}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'&&!recording)onClose();}}>
    <h2>{command.name} · 功能设置</h2><label>功能别名<textarea aria-label="功能别名" value={aliases} placeholder="每行一个别名，也可用逗号分隔" onChange={e=>setAliases(e.target.value)}/></label>
    <label>功能快捷键<input aria-label="功能快捷键" value={recording?'按下组合键…':shortcut} readOnly={recording} placeholder="例如 Control+Alt+J" onChange={e=>setShortcut(e.target.value)} onKeyDown={e=>{if(!recording)return;e.preventDefault();if(e.nativeEvent.isComposing||e.repeat||['Control','Shift','Alt','Meta'].includes(e.key))return;if(e.key==='Escape'){setRecording(false);return;}setShortcut([e.metaKey?(state.platform==='darwin'?'Command':'Super'):null,e.ctrlKey?'Control':null,e.altKey?'Alt':null,e.shiftKey?'Shift':null,e.code==='Space'?'Space':e.key.length===1?e.key.toUpperCase():e.key].filter(Boolean).join('+'));setRecording(false);}}/></label>
    <div className="tool-buttons"><button type="button" className="button" onClick={()=>setRecording(!recording)}>{recording?'取消录制':'录制快捷键'}</button><button type="button" className="button quiet" onClick={()=>{setShortcut('');setRecording(false);}}>清除快捷键</button></div>
    {status?.desired&&<p>已保存：{status.desired} · {status.effective?`已生效：${status.effective}`:status.inactive||status.error||'未生效'}</p>}
    <label className="command-disabled"><input type="checkbox" aria-label="快捷键带入当前选区" checked={captureSelection} onChange={e=>setCaptureSelection(e.target.checked)}/>快捷键带入当前选区</label>
    <label className="command-disabled"><input type="checkbox" aria-label="禁用此功能" checked={disabled} onChange={e=>setDisabled(e.target.checked)}/>禁用此功能</label>
    <div className="modal-actions"><button type="button" className="button quiet" disabled={saving} onClick={onClose}>取消</button><button type="submit" className="button primary" disabled={saving}>保存功能设置</button></div>
  </form></div>;
}

export function CommandManager(){
  const {state,toast,dialog}=useApp();
  const [query,setQuery]=useState(''),[editing,setEditing]=useState<Command|null>(null),[local,setLocal]=useState<Partial<LocalEntry>|null>(null);
  const catalog=state.commandCatalog,known=new Set(catalog.map(c=>c.id));
  const unavailable:Command[]=Object.keys(state.commandConfig.commands).filter(id=>!known.has(id)).map(id=>({id,name:id,subtitle:'功能暂不可用，配置已保留',kind:'tool',keywords:state.commandConfig.commands[id].aliases||[]}));
  const list=[...catalog,...unavailable],words=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered=words.length?list.filter(c=>words.every(word=>[c.name,c.subtitle,...c.keywords].some(value=>value.toLowerCase().includes(word)))):list;
  const saveLocal=async()=>{try{await api('commandConfig',{action:'localSave',...local});setLocal(null);toast('本地启动项已保存');}catch(e){toast(errorText(e),true);}};
  return <>
    <div className="settings-section-title"><SlidersHorizontal size={17}/>功能管理</div>
    <p className="setting-description">为功能设置别名、全局快捷键，或单独禁用。再次按功能快捷键会优先打开已有窗口。</p>
    <input className="command-filter" aria-label="筛选功能" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索功能名称或别名"/>
    <div className="command-management-list">{filtered.slice(0,200).map(command=>{const pref=state.commandConfig.commands[command.id],status=state.shortcutStatuses[command.id];return <button className="command-management-row" key={command.id} onClick={()=>setEditing(command)}><ToolIcon command={command} size={26}/><span><strong>{command.name}</strong><small>{pref?.aliases?.join(' · ')||command.subtitle}</small></span><span className="command-state">{!known.has(command.id)?'不可用':pref?.disabled?'已禁用':'已启用'}{status?.desired&&<small>{status.effective||status.inactive||status.error||'未生效'}</small>}</span></button>;})}</div>
    {filtered.length>200&&<p className="setting-description">显示前 200 项，共 {filtered.length} 项；输入名称可继续筛选。</p>}
    <div className="settings-section-title"><FolderOpen size={17}/>本地启动项</div>
    <p className="setting-description">添加文件或目录后，可按名称、别名搜索打开。</p>
    <div className="simple-list">{state.commandConfig.localEntries.map(entry=><div className="web-item" key={entry.id}><FolderOpen size={22}/><button className="web-link" onClick={()=>setLocal(entry)}><strong>{entry.name}</strong><span>{entry.path}</span></button><IconButton title={'删除本地项 '+entry.name} onClick={async()=>{if(await dialog({title:'删除本地启动项？',message:entry.name,confirm:'删除',danger:true}))void api('commandConfig',{action:'localRemove',id:entry.id}).catch(e=>toast(errorText(e),true));}}><Trash2 size={16}/></IconButton></div>)}</div>
    {local?<form className="local-entry-form" onSubmit={e=>{e.preventDefault();void saveLocal();}}><input aria-label="本地项名称" maxLength={60} value={local.name||''} placeholder="名称" onChange={e=>setLocal({...local,name:e.target.value})}/><input aria-label="本地项路径" value={local.path||''} placeholder="文件或目录的绝对路径" onChange={e=>setLocal({...local,path:e.target.value})}/><div className="tool-buttons">{[false,true].map(directory=><button type="button" className="button" key={String(directory)} onClick={async()=>{try{const target=await api<string|null>('localPick',{directory});if(target)setLocal({...local,path:target,name:local.name||target.split(/[\\/]/).pop()});}catch(e){toast(errorText(e),true);}}}>{directory?'选择目录':'选择文件'}</button>)}<button className="button primary" type="submit">保存本地项</button><button type="button" className="button quiet" onClick={()=>setLocal(null)}>取消</button></div></form>:<button className="button" onClick={()=>setLocal({})}><Plus size={16}/>添加本地启动项</button>}
    {editing&&<CommandEditor key={editing.id} command={editing} onClose={()=>setEditing(null)}/>}
  </>;
}
