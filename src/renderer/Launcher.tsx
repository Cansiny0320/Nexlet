import { useState, useEffect, useRef, type RefObject } from 'react';
import { Pin, PinOff, RefreshCw, Search } from 'lucide-react';
import type { Command } from '../shared/types';
import type { LaunchInput, InputSource, SearchResponse } from '../shared/launch';
import { api, useApp, ToolIcon, errorText, Empty } from './common';

export function Launcher({query,setQuery,input,launchInput,source,capturing}:{query:string;setQuery:(q:string)=>void;input:RefObject<HTMLInputElement|null>;launchInput:LaunchInput|null;source:InputSource;capturing:boolean}){
  const {state,toast,navigate}=useApp();
  const [response,setResponse]=useState<{key:string;value:SearchResponse}|null>(null),[selected,setSelected]=useState(0),[expanded,setExpanded]=useState(false),[all,setAll]=useState(false);
  const [menu,setMenu]=useState<{command:Command;x:number;y:number}|null>(null);
  const [icons,setIcons]=useState<Record<string,string>>({});
  const container=useRef<HTMLDivElement>(null);
  const requestKey=JSON.stringify([query,launchInput?.id,source]);
  const searching=Boolean(query.trim()||launchInput);
  const result=!capturing&&response?.key===requestKey?response.value:null;
  const results=result?.results||[],matching=result?.matches||[];
  useEffect(()=>{
    let valid=true;setResponse(null);setSelected(0);
    if(capturing)return;
    if(!launchInput)void api('clearInput').catch(()=>{});
    const timer=setTimeout(()=>{
      if(!searching)return;
      void api<SearchResponse>('search',{query,inputId:launchInput?.id,from:source}).then(value=>{if(valid&&!value.cancelled)setResponse({key:requestKey,value});}).catch(e=>{if(valid)toast(errorText(e),true);});
    },60);
    return()=>{valid=false;clearTimeout(timer);};
  },[requestKey,capturing,state.commands,state.catalogLoading,toast]);
  const indexed=new Map(state.commands.map(c=>[c.id,c]));
  const recent=state.recent.map(id=>indexed.get(id)).filter((c):c is Command=>!!c);
  const pinned=state.pinned.map(id=>indexed.get(id)).filter((c):c is Command=>!!c);
  const homeCommands=[...recent.slice(0,expanded?60:9),...(all?state.commands:pinned)];
  const visible=searching?[...results,...matching]:homeCommands;
  const iconRequest=JSON.stringify([...new Set(visible.filter(c=>!c.icon&&(c.kind==='app'||c.kind==='shortcut')).map(c=>c.id))]);
  useEffect(()=>{
    let valid=true;
    const ids=JSON.parse(iconRequest) as string[];
    void (async()=>{
      for(let offset=0;valid&&offset<ids.length;offset+=64){
        const loaded=await api<Pick<Command,'id'|'icon'>[]>('catalogIcons',ids.slice(offset,offset+64));
        if(valid)setIcons(current=>({...current,...Object.fromEntries(loaded.map(c=>[c.id,c.icon||'']))}));
      }
    })().catch(e=>{if(valid)toast(errorText(e),true);});
    return()=>{valid=false;};
  },[iconRequest,state.catalogLoading,toast]);
  async function launch(command:Command){
    try{
      const result=await api<{view?:string;payload?:string;opened?:boolean}>('launch',{id:command.id,inputId:command.inputId,payload:command.payload});
      if(result.view)navigate(result.view,result.payload);else if(result.opened!==false)setQuery('');
    }catch(e){toast(errorText(e),true);}
  }
  useEffect(()=>{const handle=(e:KeyboardEvent)=>{
    if(document.querySelector('.modal-backdrop,dialog[open]'))return;
    if(e.key==='ArrowDown'||e.key==='ArrowRight'){e.preventDefault();setSelected(i=>Math.min(i+1,visible.length-1));}
    else if(e.key==='ArrowUp'||e.key==='ArrowLeft'){e.preventDefault();setSelected(i=>Math.max(0,i-1));}
    else if(e.key==='Enter'&&visible[selected]){e.preventDefault();void launch(visible[selected]);}
  };window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);},[visible,selected]);
  useEffect(()=>{if(!container.current)return;const observer=new ResizeObserver(()=>{const height=container.current?.scrollHeight||240;void api('window',{action:'height',height:Math.max(270,Math.min(720,height+60))});});observer.observe(container.current);return()=>observer.disconnect();},[query,results.length,expanded,all,state.commands.length]);
  useEffect(()=>{const hide=()=>setMenu(null);window.addEventListener('click',hide);return()=>window.removeEventListener('click',hide);},[]);
  let index=0;
  const grid=(commands:Command[])=> <div className="tool-grid">{commands.map((command)=>{const current=index++;return <button key={command.id} className={`tool-tile ${selected===current?'selected':''}`} title={command.subtitle} onClick={()=>void launch(command)} onMouseEnter={()=>setSelected(current)} onContextMenu={e=>{e.preventDefault();setMenu({command,x:Math.min(e.clientX,innerWidth-180),y:Math.min(e.clientY,innerHeight-90)});}}><ToolIcon command={{...command,icon:command.icon||icons[command.id]}}/><span>{command.name}</span></button>;})}</div>;
  return <div className="launcher-body" ref={container}>
    {searching?<>
      {!launchInput&&<section><div className="section-label">搜索结果 {state.catalogLoading&&<small>正在索引应用…</small>}</div>{results.length?grid(results):<div className="no-match">{result?'未找到匹配的应用、快捷方式或插件':'正在匹配…'}</div>}</section>}
      <section><div className="section-label">{launchInput?'可处理此内容的功能':'匹配结果'}</div>{matching.length?grid(matching):launchInput&&<div className="no-match">{result?'未找到可处理此内容的功能':'正在匹配…'}</div>}</section>
      {result?.warning&&<div className="match-warning" role="status">{result.warning}</div>}
    </>:<>
      <section><div className="section-label">最近使用{recent.length>9&&<button onClick={()=>setExpanded(!expanded)}>{expanded?'收起':`展开 (${recent.length})`}</button>}</div>{recent.length?grid(recent.slice(0,expanded?60:9)):<div className="recent-empty">使用过的应用和工具会显示在这里</div>}</section>
      <section><div className="section-label">{all?'全部工具':'已固定'}<button onClick={()=>setAll(!all)}>{all?'返回固定':'全部 >'}</button></div>{grid(all?state.commands:pinned)}</section>
    </>}
    <footer className="launcher-footer"><span>{state.catalogLoading?'正在扫描快捷方式…':`${state.commands.filter(c=>c.kind==='app'||c.kind==='shortcut').length} 个应用与快捷方式`}</span><span>方向键选择 · Enter 打开 · 右键固定</span></footer>
    {state.shortcutError&&<button className="shortcut-warning" onClick={()=>navigate('settings')}>{state.shortcutError}</button>}
    {menu&&<div className="context-menu" style={{left:menu.x,top:menu.y}} onClick={e=>e.stopPropagation()}><button onClick={()=>{void api('pin',menu.command.id).catch(e=>toast(errorText(e),true));setMenu(null);}}>{state.pinned.includes(menu.command.id)?<PinOff size={15}/>:<Pin size={15}/>} {state.pinned.includes(menu.command.id)?'取消固定':'固定到首页'}</button></div>}
  </div>;
}
