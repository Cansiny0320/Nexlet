import { useState, useEffect, useMemo, useRef, type RefObject } from 'react';
import { Pin, PinOff, RefreshCw, Search } from 'lucide-react';
import type { Command } from '../shared/types';
import { calculate } from '../shared/calculator';
import { api, useApp, ToolIcon, errorText, Empty } from './common';

export function Launcher({query,setQuery,input}:{query:string;setQuery:(q:string)=>void;input:RefObject<HTMLInputElement|null>}){
  const {state,toast,navigate}=useApp();
  const [results,setResults]=useState<Command[]>([]),[selected,setSelected]=useState(0),[expanded,setExpanded]=useState(false),[all,setAll]=useState(false);
  const [menu,setMenu]=useState<{command:Command;x:number;y:number}|null>(null);
  const container=useRef<HTMLDivElement>(null);
  useEffect(()=>{let valid=true;const timer=setTimeout(()=>{if(!query.trim()){setResults([]);return;}void api<Command[]>('search',query).then(r=>{if(valid)setResults(r);}).catch(e=>toast(errorText(e),true));},60);setSelected(0);return()=>{valid=false;clearTimeout(timer);};},[query,state.commands,state.catalogLoading,toast]);
  const matching=useMemo<Command[]>(()=>{
    const q=query.trim();if(!q)return[];
    const output:Command[]=[];const calc=calculate(q);
    if(calc.result&&/[0-9]/.test(q))output.push({id:'match:calc',name:calc.result,subtitle:`${q} = ${calc.result} · 打开计算稿纸`,kind:'match',keywords:[],color:'#ff9c00',payload:q});
    if(/^https?:\/\//i.test(q))output.push({id:'input:url',name:'打开链接',subtitle:q,kind:'match',keywords:[],color:'#3387f7',payload:q});
    if(/^[{[]/.test(q))output.push({id:'match:json',name:'JSON 格式化',subtitle:'将输入内容带入 JSON 工具',kind:'match',keywords:[],color:'#42a869',payload:q});
    output.push({id:'match:clipboard',name:'剪贴板搜索',subtitle:'在剪贴板历史中搜索当前内容',kind:'match',keywords:[],color:'#6962ff',payload:q});
    return output;
  },[query]);
  const indexed=new Map(state.commands.map(c=>[c.id,c]));
  const recent=state.recent.map(id=>indexed.get(id)).filter((c):c is Command=>!!c);
  const pinned=state.pinned.map(id=>indexed.get(id)).filter((c):c is Command=>!!c);
  const homeCommands=[...recent.slice(0,expanded?60:9),...(all?state.commands:pinned)];
  const visible=query.trim()?[...results,...matching]:homeCommands;
  async function launch(command:Command){
    try{
      if(command.id.startsWith('match:')){const view=command.id==='match:calc'?'scratchpad':command.id==='match:json'?'json':'clipboard';navigate(view,command.payload);return;}
      const result=await api<{view?:string}>('launch',{id:command.id,payload:command.payload});
      if(result.view)navigate(result.view);else setQuery('');
    }catch(e){toast(errorText(e),true);}
  }
  useEffect(()=>{const handle=(e:KeyboardEvent)=>{
    if(document.querySelector('.modal-backdrop'))return;
    if(e.key==='ArrowDown'||e.key==='ArrowRight'){e.preventDefault();setSelected(i=>Math.min(i+1,visible.length-1));}
    else if(e.key==='ArrowUp'||e.key==='ArrowLeft'){e.preventDefault();setSelected(i=>Math.max(0,i-1));}
    else if(e.key==='Enter'&&visible[selected]){e.preventDefault();void launch(visible[selected]);}
  };window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);},[visible,selected]);
  useEffect(()=>{if(!container.current)return;const observer=new ResizeObserver(()=>{const height=container.current?.scrollHeight||240;void api('window',{action:'height',height:Math.max(270,Math.min(720,height+60))});});observer.observe(container.current);return()=>observer.disconnect();},[query,results.length,expanded,all,state.commands.length]);
  useEffect(()=>{const hide=()=>setMenu(null);window.addEventListener('click',hide);return()=>window.removeEventListener('click',hide);},[]);
  let index=0;
  const grid=(commands:Command[])=> <div className="tool-grid">{commands.map((command)=>{const current=index++;return <button key={command.id} className={`tool-tile ${selected===current?'selected':''}`} title={command.subtitle} onClick={()=>void launch(command)} onMouseEnter={()=>setSelected(current)} onContextMenu={e=>{e.preventDefault();setMenu({command,x:Math.min(e.clientX,innerWidth-180),y:Math.min(e.clientY,innerHeight-90)});}}><ToolIcon command={command}/><span>{command.name}</span></button>;})}</div>;
  return <div className="launcher-body" ref={container}>
    {query.trim()?<>
      <section><div className="section-label">搜索结果 {state.catalogLoading&&<small>正在索引应用…</small>}</div>{results.length?grid(results):<div className="no-match">未找到匹配的应用、快捷方式或插件</div>}</section>
      <section><div className="section-label">匹配结果</div>{grid(matching)}</section>
    </>:<>
      <section><div className="section-label">最近使用{recent.length>9&&<button onClick={()=>setExpanded(!expanded)}>{expanded?'收起':`展开 (${recent.length})`}</button>}</div>{recent.length?grid(recent.slice(0,expanded?60:9)):<div className="recent-empty">使用过的应用和工具会显示在这里</div>}</section>
      <section><div className="section-label">{all?'全部工具':'已固定'}<button onClick={()=>setAll(!all)}>{all?'返回固定':'全部 >'}</button></div>{grid(all?state.commands:pinned)}</section>
    </>}
    <footer className="launcher-footer"><span>{state.catalogLoading?'正在扫描快捷方式…':`${state.commands.filter(c=>c.kind==='app'||c.kind==='shortcut').length} 个应用与快捷方式`}</span><span>方向键选择 · Enter 打开 · 右键固定</span></footer>
    {state.shortcutError&&<button className="shortcut-warning" onClick={()=>navigate('settings')}>{state.shortcutError}</button>}
    {menu&&<div className="context-menu" style={{left:menu.x,top:menu.y}} onClick={e=>e.stopPropagation()}><button onClick={()=>{void api('pin',menu.command.id).catch(e=>toast(errorText(e),true));setMenu(null);}}>{state.pinned.includes(menu.command.id)?<PinOff size={15}/>:<Pin size={15}/>} {state.pinned.includes(menu.command.id)?'取消固定':'固定到首页'}</button></div>}
  </div>;
}
