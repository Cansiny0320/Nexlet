import { t } from '../shared/i18n';
import { useState, useEffect, useRef, type RefObject } from 'react';
import { Pin, PinOff, List, Grid3X3, Settings2, ArrowUp, ArrowDown, EyeOff, Clock } from 'lucide-react';
import type { Command } from '../shared/types';
import { MATCH_TARGETS } from '../shared/command-config';
import type { LaunchInput, InputSource, SearchResponse } from '../shared/launch';
import { api, useApp, ToolIcon, errorText } from './common';
import { CommandEditor } from './CommandManager';

export function Launcher({query,setQuery,input,launchInput,source,capturing}:{query:string;setQuery:(q:string)=>void;input:RefObject<HTMLInputElement|null>;launchInput:LaunchInput|null;source:InputSource;capturing:boolean}){
  const {state,toast,navigate,dialog}=useApp();
  const [response,setResponse]=useState<{key:string;value:SearchResponse}|null>(null),[selected,setSelected]=useState(''),[expanded,setExpanded]=useState(false),[all,setAll]=useState(false);
  const [menu,setMenu]=useState<{command:Command;x:number;y:number}|null>(null),[editing,setEditing]=useState<Command|null>(null);
  const [icons,setIcons]=useState<Record<string,string>>({});
  const container=useRef<HTMLDivElement>(null),launching=useRef(false);
  const requestKey=JSON.stringify([query,launchInput?.id,source]);
  const searching=Boolean(query.trim()||launchInput);
  const result=!capturing&&response?.key===requestKey?response.value:null;
  const results=result?.results||[],matching=result?.matches||[];
  const layout=state.commandConfig.layout;
  useEffect(()=>setSelected(''),[requestKey]);
  useEffect(()=>{
    let valid=true;setResponse(null);
    if(capturing)return;
    if(!launchInput)void api('clearInput').catch(()=>{});
    const requestId=crypto.randomUUID();
    const unsubscribe=window.nexlet.onSearchProgress(event=>{if(valid&&event.requestId===requestId)setResponse({key:requestKey,value:event.response});});
    const timer=setTimeout(()=>{
      if(!searching)return;
      void api<SearchResponse>('search',{query,inputId:launchInput?.id,from:source,requestId}).then(value=>{if(valid&&!value.cancelled)setResponse({key:requestKey,value});}).catch(e=>{if(valid)toast(errorText(e),true);});
    },60);
    return()=>{valid=false;clearTimeout(timer);unsubscribe();};
  },[requestKey,capturing,state.commands,state.catalogLoading,toast]);
  const indexed=new Map(state.commands.map(c=>[c.id,c]));
  const pinned=state.pinned.map(id=>indexed.get(id)).filter((c):c is Command=>!!c);
  const pinnedIds=new Set(state.pinned);
  const recent=[...new Set(state.recent)].filter(id=>!pinnedIds.has(id)).map(id=>indexed.get(id)).filter((c):c is Command=>!!c);
  const recentVisible=recent.slice(0,expanded?60:9);
  const visible=searching?[...results,...matching]:all?state.commands:[...pinned,...recentVisible];
  const visibleKey=visible.map(c=>c.id).join('\0');
  const activeId=visible.some(c=>c.id===selected)?selected:visible[0]?.id||'';
  useEffect(()=>{if(!searching||result)setSelected(current=>visible.some(c=>c.id===current)?current:visible[0]?.id||'');},[visibleKey,!!result,searching]);
  const iconRequest=JSON.stringify([...new Set(visible.filter(c=>!c.icon&&icons[c.id]===undefined&&(c.kind==='app'||c.kind==='shortcut'||c.kind==='system')).map(c=>c.id))]);
  useEffect(()=>{
    let valid=true;const ids=JSON.parse(iconRequest) as string[];
    void (async()=>{for(let offset=0;valid&&offset<ids.length;offset+=64){const loaded=await api<Pick<Command,'id'|'icon'>[]>('catalogIcons',ids.slice(offset,offset+64));if(valid)setIcons(current=>({...current,...Object.fromEntries(loaded.map(c=>[c.id,c.icon||'']))}));}})().catch(e=>{if(valid)toast(errorText(e),true);});
    return()=>{valid=false;};
  },[iconRequest,state.catalogLoading,toast]);
  async function launch(command:Command){
    if(launching.current)return;launching.current=true;
    try{
      let result=await api<{view?:string;payload?:string;opened?:boolean;needsQuery?:string}>('launch',{id:command.id,inputId:command.inputId,payload:command.payload,...(!command.inputId&&command.payload===undefined?{mode:'open'}:{})});
      if(result.needsQuery){const value=await dialog({title:t("搜索 ")+result.needsQuery,input:'',placeholder:t("输入搜索内容"),confirm:t("搜索")});if(typeof value!=='string'||!value.trim())return;result=await api('launch',{id:command.id,query:value});}
      if(result.view)navigate(result.view,result.payload);else if(result.opened!==false)setQuery('');
    }catch(e){toast(errorText(e),true);}finally{launching.current=false;}
  }
  const action=async(payload:unknown)=>{try{await api('commandConfig',payload);}catch(e){toast(errorText(e),true);}setMenu(null);};
  const movePinned=(id:string,offset:number)=>{const ids=[...state.pinned],index=ids.indexOf(id),target=index+offset;if(index<0||target<0||target>=ids.length)return;[ids[index],ids[target]]=[ids[target],ids[index]];void action({action:'reorder',ids,revision:state.commandConfig.revision});};
  useEffect(()=>{const handle=(e:KeyboardEvent)=>{
    if(e.defaultPrevented||e.isComposing||e.keyCode===229||e.repeat||document.querySelector('.modal-backdrop,dialog[open]')||menu)return;
    if(e.target instanceof HTMLElement&&e.target.closest('button')&&!e.target.closest('[data-command-id]'))return;
    const index=visible.findIndex(c=>c.id===activeId);
    if(['ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(e.key)){
      e.preventDefault();const forward=e.key==='ArrowDown'||e.key==='ArrowRight';
      if(layout==='grid'&&(e.key==='ArrowDown'||e.key==='ArrowUp')){
        const grid=container.current?.querySelector('.tool-grid'),columns=grid?getComputedStyle(grid).gridTemplateColumns.split(' ').length:1;
        const groups=searching?[results,matching]:all?[state.commands]:[pinned,recentVisible];
        const rows=groups.flatMap(group=>Array.from({length:Math.ceil(group.length/columns)},(_,i)=>group.slice(i*columns,(i+1)*columns)));
        const row=rows.findIndex(items=>items.some(c=>c.id===activeId)),column=rows[row]?.findIndex(c=>c.id===activeId)??0,target=rows[row+(forward?1:-1)];
        if(target)setSelected(target[Math.min(column,target.length-1)].id);
      }else setSelected(visible[Math.max(0,Math.min(visible.length-1,index+(forward?1:-1)))]?.id||'');
    }else if(e.key==='Enter'&&index>=0){e.preventDefault();void launch(visible[index]);}
  };window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);},[visible,activeId,layout,menu]);
  useEffect(()=>{container.current?.querySelector(`[data-command-id="${CSS.escape(activeId)}"]`)?.scrollIntoView({block:'nearest'});},[activeId]);
  useEffect(()=>{if(!container.current)return;if(editing){void api('window',{action:'height',height:600});return;}const observer=new ResizeObserver(()=>{const height=container.current?.scrollHeight||240;void api('window',{action:'height',height:Math.max(270,Math.min(720,height+60))});});observer.observe(container.current);return()=>observer.disconnect();},[query,results.length,expanded,all,layout,state.commands.length,editing]);
  useEffect(()=>{const hide=()=>setMenu(null);window.addEventListener('click',hide);return()=>window.removeEventListener('click',hide);},[]);
  const renderCommands=(commands:Command[])=> <div className={layout==='list'?'tool-list':'tool-grid'}>{commands.map(command=><button key={command.id} aria-label={command.name} data-command-id={command.id} className={`${layout==='list'?'tool-row':'tool-tile'} ${activeId===command.id?'selected':''}`} title={[command.name,command.subtitle].filter(Boolean).join('\n')} onClick={()=>void launch(command)} onMouseEnter={()=>setSelected(command.id)} onContextMenu={e=>{e.preventDefault();setSelected(command.id);setMenu({command,x:Math.max(5,Math.min(e.clientX,innerWidth-225)),y:Math.max(5,Math.min(e.clientY,innerHeight-240))});}}><ToolIcon command={{...command,icon:command.icon||icons[command.id]}} size={38}/><span className="command-label">{command.name}{layout==='list'&&<small>{command.subtitle}</small>}</span>{layout==='list'&&state.shortcutStatuses[command.id]?.effective&&<kbd>{state.shortcutStatuses[command.id].effective}</kbd>}</button>)}</div>;
  const menuId=menu?(MATCH_TARGETS[menu.command.id]||menu.command.id):'',menuCommand=indexed.get(menuId);
  return <div className="launcher-body" ref={container}>
    {searching?<>
      {!launchInput&&<section><div className="section-label">{t("搜索结果")}{state.catalogLoading&&<small>{t("正在索引应用…")}</small>}</div>{results.length?renderCommands(results):<div className="no-match">{result?t("未找到匹配的应用、快捷方式或插件"):t("正在匹配…")}</div>}</section>}
      <section><div className="section-label">{launchInput?t("可处理此内容的功能"):t("匹配结果")}</div>{matching.length?renderCommands(matching):launchInput&&<div className="no-match">{result?t("未找到可处理此内容的功能"):t("正在匹配…")}</div>}</section>
      {result?.warning&&<div className="match-warning" role="status">{result.warning}</div>}
    </>:<>
      <section><div className="section-label">{all?t("全部工具"):t("已固定")}<button onClick={()=>setAll(!all)}>{all?t("返回固定"):t("全部 >")}</button></div>{renderCommands(all?state.commands:pinned)}</section>
      {!all&&<section><div className="section-label">{t("最近使用")}{recent.length>9&&<button onClick={()=>setExpanded(!expanded)}>{expanded?t("收起"):t("展开 ({{v0}})", { v0: recent.length })}</button>}</div>{recent.length?renderCommands(recentVisible):<div className="recent-empty">{t("使用过且未固定的应用和工具会显示在这里")}</div>}</section>}
    </>}
    <footer className="launcher-footer"><span>{state.catalogLoading?t("正在扫描快捷方式…"):t("{{v0}} 个应用与快捷方式", { v0: state.commands.filter(c=>c.kind==='app'||c.kind==='shortcut').length })}</span><span>{t("方向键选择 · Enter 打开 · 右键管理")}</span><div className="layout-switch"><button aria-label={t("网格展示")} aria-pressed={layout==='grid'} onClick={()=>void action({action:'layout',value:'grid'})}><Grid3X3 size={17}/></button><button aria-label={t("列表展示")} aria-pressed={layout==='list'} onClick={()=>void action({action:'layout',value:'list'})}><List size={17}/></button></div></footer>
    {state.shortcutError&&<button className="shortcut-warning" onClick={()=>navigate('settings')}>{state.shortcutError}</button>}
    {menu&&menuCommand&&<div className="context-menu launcher-menu" style={{left:menu.x,top:menu.y}} onClick={e=>e.stopPropagation()}>
      <button onClick={()=>void action({action:'pin',id:menuId})}>{state.pinned.includes(menuId)?<PinOff size={15}/>:<Pin size={15}/>} {state.pinned.includes(menuId)?t("取消固定"):t("固定到首页")}</button>
      {state.pinned.includes(menuId)&&<><button disabled={state.pinned.indexOf(menuId)===0} onClick={()=>movePinned(menuId,-1)}><ArrowUp size={15}/>{t("固定项前移")}</button><button disabled={state.pinned.indexOf(menuId)===state.pinned.length-1} onClick={()=>movePinned(menuId,1)}><ArrowDown size={15}/>{t("固定项后移")}</button></>}
      {state.recent.includes(menuId)&&<button onClick={()=>void action({action:'removeRecent',id:menuId})}><Clock size={15}/>{t("从最近使用移除")}</button>}
      <button onClick={()=>{setEditing(menuCommand);setMenu(null);}}><Settings2 size={15}/>{t("别名与快捷键")}</button>
      <button onClick={()=>void action({action:'patch',id:menuId,patch:{disabled:true}})}><EyeOff size={15}/>{t("禁用此功能")}</button>
    </div>}
    {editing&&<CommandEditor key={editing.id} command={editing} onClose={()=>{setEditing(null);input.current?.focus();}}/>}
  </div>;
}
