import { useState,useEffect,useRef,useCallback } from 'react';
import { ClipboardCopy, Send, Pin, ExternalLink, Settings, Brush, Star, Trash2, Type, Image as ImageIcon, Files, ClipboardList, Download, Copy, Pause, Play } from 'lucide-react';
import type { ClipItem } from '../shared/types';
import { api,useApp,errorText,IconButton,Empty,relativeTime } from './common';

const filters=[['all','全部',ClipboardList],['text','文本',Type],['image','图像',ImageIcon],['files','文件',Files],['favorite','收藏',Star]] as const;
export function ClipboardPanel({query,setQuery,board}:{query:string;setQuery:(value:string)=>void;board:boolean}){
  const {state,toast,dialog,navigate}=useApp();
  const [kind,setKind]=useState('all'),[items,setItems]=useState<ClipItem[]>([]),[selected,setSelected]=useState<string[]>([]),[cursor,setCursor]=useState(0),[expanded,setExpanded]=useState<string|null>(null);
  const [context,setContext]=useState<{x:number;y:number;ids:string[]}|null>(null);
  const rows=useRef(new Map<string,HTMLDivElement>()),loadId=useRef(0);
  const reload=useCallback(async()=>{const id=++loadId.current;try{const list=await api<ClipItem[]>('clips',{query,kind});if(id!==loadId.current)return;setItems(list);setSelected(old=>{const kept=old.filter(v=>list.some(i=>i.id===v));return kept.length?kept:list[0]?[list[0].id]:[];});setCursor(v=>Math.max(0,Math.min(v,list.length-1)));}catch(e){toast(errorText(e),true);}},[query,kind,toast]);
  useEffect(()=>{void reload();return window.nexlet.onChange(event=>{if(event==='clips')void reload();});},[reload]);
  useEffect(()=>{setCursor(0);setSelected([]);},[query,kind]);
  useEffect(()=>{const hide=()=>setContext(null);window.addEventListener('click',hide);return()=>window.removeEventListener('click',hide);},[]);
  const action=useCallback(async(name:string,ids=selected,extra:Record<string,unknown>={})=>{
    try{const result=await api('clipAction',{action:name,ids,...extra});
      if(name==='copy')toast('已复制');if(name==='paste')toast('已发送粘贴请求');if(name==='save'&&result)toast('图片已保存');
    }catch(e){toast(errorText(e),true);}setContext(null);
  },[selected,toast]);
  const remove=async(ids=selected)=>{if(await dialog({title:'删除所选记录？',message:'只删除 Nexlet 中的历史记录，原文件不会被删除。',confirm:'删除',danger:true}))await action('delete',ids);};
  useEffect(()=>{const handle=(e:KeyboardEvent)=>{
    if(document.querySelector('.modal-backdrop'))return;
    const input=e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();const next=Math.min(Math.max(0,cursor+(e.key==='ArrowDown'?1:-1)),items.length-1);setCursor(next);if(items[next]){setSelected([items[next].id]);rows.current.get(items[next].id)?.scrollIntoView({block:'nearest'});}
    }else if(e.key==='Enter'&&selected.length){e.preventDefault();void action(state.canPaste?'paste':'copy');}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){
      const field=e.target as HTMLInputElement;
      if(input&&field.selectionStart!==field.selectionEnd)return;
      if(window.getSelection()?.toString())return;
      e.preventDefault();void action('copy');
    }else if(e.key===' '&&!input){e.preventDefault();const item=items[cursor];if(item)setSelected(old=>old.includes(item.id)?old.filter(id=>id!==item.id):[...old,item.id]);}
    else if(e.key==='Delete'&&!input&&selected.length){e.preventDefault();void remove();}
    else if((e.key==='/'||(e.ctrlKey||e.metaKey)&&e.key==='f')&&!input){e.preventDefault();document.querySelector<HTMLInputElement>('.clipboard-search')?.focus();}
  };window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);},[cursor,items,selected,action,state.canPaste]);
  function select(item:ClipItem,index:number,event:React.MouseEvent){
    if(event.shiftKey){const start=Math.min(cursor,index),end=Math.max(cursor,index);setSelected(items.slice(start,end+1).map(i=>i.id));}
    else if(event.ctrlKey||event.metaKey)setSelected(old=>old.includes(item.id)?old.filter(id=>id!==item.id):[...old,item.id]);
    else setSelected([item.id]);setCursor(index);
  }
  return <div className="clipboard-panel">
    <div className="clipboard-tabs">{filters.map(([id,label,Icon])=><button key={id} className={kind===id?'active':''} onClick={()=>setKind(id)}><Icon size={16}/>{label}{id==='favorite'&&kind==='favorite'?`（${items.length}）`:''}</button>)}<span className="tabs-spacer"/><button className="pause-button" title={state.settings.clipboardEnabled?'暂停记录':'恢复记录'} aria-label={state.settings.clipboardEnabled?'暂停记录':'恢复记录'} onClick={()=>void api('settings',{clipboardEnabled:!state.settings.clipboardEnabled}).catch(e=>toast(errorText(e),true))}>{state.settings.clipboardEnabled?<Pause size={15}/>:<Play size={15}/>}</button></div>
    {!state.settings.clipboardEnabled&&<div className="recording-paused">已暂停记录新内容</div>}
    <div className="clipboard-layout"><div className="clipboard-list" tabIndex={0} aria-label="剪贴板历史">
      {!items.length&&<Empty icon={<ClipboardList size={34}/>}>{query?'没有找到匹配的记录':board?'中转站没有可用记录':'复制文本、图片或文件后，历史会显示在这里'}</Empty>}
      {items.map((item,index)=><div key={item.id} ref={node=>{if(node)rows.current.set(item.id,node);else rows.current.delete(item.id);}} className={`clip-item ${selected.includes(item.id)?'selected':''}`} role="option" aria-selected={selected.includes(item.id)} tabIndex={-1} onClick={e=>select(item,index,e)} onDoubleClick={()=>void action(state.canPaste?'paste':'copy',[item.id])} onContextMenu={e=>{e.preventDefault();const targets=selected.includes(item.id)?selected:[item.id];setSelected(targets);setContext({x:Math.min(e.clientX,innerWidth-185),y:Math.min(e.clientY,innerHeight-240),ids:targets});}}>
        {item.kind==='image'?<div className="clip-picture"><img src={expanded===item.id?`nexlet-image://local/${item.imagePath?.split(/[\\/]/).pop()}`:item.thumbnail} alt="剪贴板图片" draggable={false} className={expanded===item.id?'expanded':''}/><button onClick={e=>{e.stopPropagation();setExpanded(expanded===item.id?null:item.id);}}>{expanded===item.id?'收起':'展开'}</button></div>:
         item.kind==='files'?<div className="clip-files"><Files size={25}/><div>{item.files?.map(file=><div key={file} title={file}>{file.split(/[\\/]/).pop()}</div>)}</div></div>:
         <div className={`clip-text ${expanded===item.id?'expanded':''}`}>{item.text.slice(0,expanded===item.id?200000:600)}{item.text.length>150&&<button className="inline-expand" onClick={e=>{e.stopPropagation();setExpanded(expanded===item.id?null:item.id);}}>{expanded===item.id?'收起':'展开'}</button>}</div>}
        <div className="clip-meta"><span>{relativeTime(item.createdAt)}</span><span>{item.favorite&&<Star size={12} fill="currentColor"/>}{item.kind==='text'?`${Array.from(item.text).length} 字符`:item.kind==='image'?`${item.width} × ${item.height}`:`${item.files?.length} 个文件`}<em>{index+1}</em></span></div>
      </div>)}
    </div><aside className="clipboard-actions">
      <IconButton className="round primary" title="复制" disabled={!selected.length} onClick={()=>void action('copy')}><ClipboardCopy size={22}/></IconButton>
      <IconButton className="round primary" title={state.canPaste?'执行粘贴':'请从目标应用用快捷键唤起后粘贴'} disabled={!selected.length||!state.canPaste} onClick={()=>void action('paste')}><Send size={21}/></IconButton>
      <IconButton className="round primary" title="悬浮中转" disabled={!selected.length} onClick={()=>void action('station')}><Pin size={21}/></IconButton>
      <div className="rail-spacer"/>
      <IconButton title="打开独立剪贴板" onClick={()=>void api('window',{action:'detach',view:'clipboard'}).catch(e=>toast(errorText(e),true))}><ExternalLink size={20}/></IconButton>
      <IconButton title="剪贴板设置" onClick={()=>navigate('settings')}><Settings size={20}/></IconButton>
      <IconButton title="清空历史记录" onClick={async()=>{if(await dialog({title:'清空剪贴板历史？',message:'收藏内容会保留。不会清空系统剪贴板，也不会删除原文件。',confirm:'清空历史',danger:true}))await action('clear',[],{includeFavorites:false});}}><Brush size={21}/></IconButton>
    </aside></div>
    {selected.length>1&&<div className="selection-status">已选择 {selected.length} 项 · Ctrl/Cmd+C 合并复制</div>}
    {context&&<div className="context-menu" style={{left:context.x,top:context.y}} onClick={e=>e.stopPropagation()}>
      <button onClick={()=>void action('copy',context.ids)}><Copy size={15}/>复制</button>
      <button disabled={!state.canPaste} onClick={()=>void action('paste',context.ids)}><Send size={15}/>执行粘贴</button>
      <button onClick={()=>void action('station',context.ids)}><Pin size={15}/>悬浮中转</button><hr/>
      <button onClick={()=>void action('favorite',context.ids,{value:!items.find(i=>i.id===context.ids[0])?.favorite})}><Star size={15}/>{items.find(i=>i.id===context.ids[0])?.favorite?'取消收藏':'收藏'}</button>
      {context.ids.length===1&&items.find(i=>i.id===context.ids[0])?.kind==='image'&&<button onClick={()=>void action('save',context.ids)}><Download size={15}/>保存图片</button>}
      <button onClick={()=>{void remove(context.ids);setContext(null);}}><Trash2 size={15}/>删除记录</button>
    </div>}
  </div>;
}
