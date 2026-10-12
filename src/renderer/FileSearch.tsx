import { useToolState, useRestoreBarrier } from './tool-session';
import { useState,useEffect,useRef } from 'react';
import { Search, File, Folder, FolderOpen, Copy, ExternalLink, RefreshCw, Settings, LoaderCircle } from 'lucide-react';
import type { FileSearchResult, FileSearchIndexStatus } from '../shared/everything';
import { SPOTLIGHT_IDLE } from '../shared/spotlight';
import { api,useApp,errorText,IconButton,Empty } from './common';
import './filesearch.css';

export function FileSearch(){
  const {state,toast,navigate}=useApp();
  const [query,setQuery]=useToolState('query',''),[selected,setSelected]=useToolState('selected','');
  const [result,setResult]=useState<FileSearchResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [index,setIndex]=useState<FileSearchIndexStatus|null>(null),[preparationRequest,setPreparationRequest]=useState(0);
  const sequence=useRef(0),input=useRef<HTMLInputElement>(null);
  const mac=state.platform==='darwin',scopesKey=JSON.stringify(state.settings.fileSearchPaths);
  const canSearch=mac||index?.status==='ready';
  const preparing=!mac&&(!index||index.status==='preparing');
  const restoration=useRestoreBarrier();

  const search=async(value:string)=>{
    const id=++sequence.current;setBusy(Boolean(value.trim()));setError('');
    try{
      const next=await api<FileSearchResult>('fileSearch',value);
      if(id!==sequence.current)return;
      setResult(next);setSelected(old=>next.items.some(item=>item.path===old)?old:next.items[0]?.path||'');
      if(!mac&&next.status==='indexing'){
        setIndex(old=>({status:'preparing',message:next.message,startedAt:Date.now(),version:next.version,scopes:next.scopes||old?.scopes}));
        setPreparationRequest(old=>old+1);
      }
    }catch(e){if(id===sequence.current){setError(errorText(e));setResult(null);}}
    finally{if(id===sequence.current)setBusy(false);}
  };
  useEffect(()=>{input.current?.focus();},[]);
  useEffect(()=>{
    if(mac)return;
    let disposed=false,timer:ReturnType<typeof setTimeout>;
    setIndex({status:'preparing',message:'正在准备文件索引…',startedAt:Date.now(),scopes:state.settings.fileSearchPaths});
    const check=async()=>{
      try{
        const next=await api<FileSearchIndexStatus>('fileSearchStatus');
        if(disposed)return;
        setIndex(next);
        if(next.status==='preparing')timer=setTimeout(()=>void check(),2000);
      }catch(e){if(!disposed)setIndex(old=>({status:'unavailable',message:errorText(e),startedAt:old?.startedAt||Date.now(),scopes:old?.scopes}));}
    };
    void check();
    return()=>{disposed=true;clearTimeout(timer);};
  },[mac,scopesKey,preparationRequest]);
  useEffect(()=>{
    sequence.current++;setResult(null);setError('');setBusy(false);
    if(query.trim()&&!canSearch)return;
    let resolve!:()=>void;const pending=new Promise<void>(done=>{resolve=done;});
    const timer=setTimeout(()=>{void search(query).finally(resolve);},250);
    if(restoration&&'query' in restoration.initial)restoration.restores.add(pending);
    return()=>{clearTimeout(timer);resolve();sequence.current++;};
  },[query,scopesKey,canSearch]);
  // Spotlight retains query retries; Windows checks readiness separately.
  useEffect(()=>{if(!mac||!query.trim()||result?.status!=='indexing')return;const timer=setTimeout(()=>void search(query),2000);return()=>clearTimeout(timer);},[mac,result,query]);

  const retry=()=>{if(mac)void search(query);else setPreparationRequest(old=>old+1);};
  const action=async(action:string,path?:string)=>{try{await api('fileAction',{action,path});if(action==='copy')toast('已复制文件路径');}catch(e){toast(errorText(e),true);}};
  const current=result?.items.find(i=>i.path===selected);
  const keyboard=(e:React.KeyboardEvent)=>{const items=result?.items||[];if(!items.length)return;const index=items.findIndex(i=>i.path===selected);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const next=items[Math.min(items.length-1,Math.max(0,index+(e.key==='ArrowDown'?1:-1)))];setSelected(next.path);document.getElementById('file-result-'+items.indexOf(next))?.scrollIntoView({block:'nearest'});}if(e.key==='Enter'&&current){e.preventDefault();void action('open',current.path);}};
  const unavailable=!mac&&index?.status==='unavailable'?index.message:result?.status==='unavailable'?result.message:'';
  const scopes=mac?result?.scopes:index?.scopes||result?.scopes;
  const version=index?.version||result?.version;
  return <div className="file-search-panel" onKeyDown={keyboard}>
    <div className="file-search-bar"><Search size={17}/><input ref={input} aria-label={mac?'Spotlight 文件搜索':'Everything 文件搜索'} placeholder={mac?'搜索文件名，支持多关键词、*.pdf 和 ext:pdf':'搜索文件名或路径，支持 Everything 语法'} maxLength={1024} value={query} onChange={e=>setQuery(e.target.value)}/><IconButton title={mac?'搜索范围设置':'索引范围设置'} onClick={()=>navigate('settings')}><Settings size={16}/></IconButton><IconButton title="重新搜索" disabled={busy||!query.trim()||!canSearch} onClick={()=>void search(query)}><RefreshCw size={16}/></IconButton></div>
    <div className="file-results">
      {preparing?<IndexPreparation status={index}/>:unavailable?<Empty icon={<Search size={30}/>}><span>{unavailable}</span><button className="button" onClick={retry}>重试</button></Empty>:error?<Empty icon={<Search size={30}/>}>{error}<button className="button" onClick={()=>void search(query)}>重试</button></Empty>:busy?<Empty icon={<LoaderCircle className="file-search-spinner" size={30}/>}>{mac?'正在搜索文件…':'正在搜索…'}</Empty>:!result?.items.length?<Empty icon={<Search size={30}/>}>{result?.message||(mac?SPOTLIGHT_IDLE:'输入文件名或路径开始搜索，例如 ext:pdf 项目')}</Empty>:<div role="listbox" aria-label="文件搜索结果">{result.items.map((item,i)=><button id={'file-result-'+i} role="option" aria-selected={item.path===selected} className="file-result" key={item.path} onClick={()=>setSelected(item.path)} onDoubleClick={()=>void action('open',item.path)}><span className={item.directory?'file-folder':'file-document'}>{item.directory?<Folder size={25}/>:<File size={24}/>}</span><span className="file-result-name"><strong>{item.name}</strong><small title={item.path}>{item.parent}</small></span><span className="file-meta">{item.directory?'文件夹':fileSize(item.size)}<small>{item.modified.replace('T',' ').slice(0,16)}</small></span></button>)}</div>}
    </div>
    <footer className="file-search-footer"><span title={scopes?.join('、')}>{result?.items.length?`${result.items.length} 个结果${result.limited?' · 前 200 项':''}`:mac?'Spotlight · 系统索引':version?`Everything ${version}`:'内置 Everything · 本地索引'}{scopes?.length?` · ${scopes.length} 个${mac?'搜索':'索引'}目录`:''}{!mac&&index?.status==='ready'?' · 索引已就绪':''}</span><span className="flex-spacer"/>{current&&<><IconButton title="打开文件" onClick={()=>void action('open',current.path)}><ExternalLink size={16}/></IconButton><IconButton title="打开所在文件夹" onClick={()=>void action('reveal',current.path)}><FolderOpen size={16}/></IconButton><IconButton title="复制文件路径" onClick={()=>void action('copy',current.path)}><Copy size={16}/></IconButton></>}</footer>
  </div>;
}
function IndexPreparation({status}:{status:FileSearchIndexStatus|null}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const elapsed=Math.max(0,Math.floor((now-(status?.startedAt||now))/1000));
  const duration=elapsed<60?`${elapsed} 秒`:`${Math.floor(elapsed/60)} 分 ${elapsed%60} 秒`;
  return <div className="empty-state file-index-state" role="status" aria-label="文件索引准备中"><LoaderCircle className="file-search-spinner" size={30} aria-hidden="true"/><p><span>{status?.message||'正在准备文件索引…'}</span><span className="file-index-detail">已等待 {duration}{status?.scopes?.length?` · ${status.scopes.length} 个索引目录`:''}</span><span className="file-index-hint">可以先输入关键词，索引就绪后会自动搜索。</span></p></div>;
}
function fileSize(size:number|null){if(size===null)return '—';if(size<1024)return size+' B';if(size<1024*1024)return (size/1024).toFixed(1)+' KB';if(size<1024**3)return (size/1024**2).toFixed(1)+' MB';return (size/1024**3).toFixed(1)+' GB';}
