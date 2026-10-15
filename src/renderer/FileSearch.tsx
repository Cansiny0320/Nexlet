import { formatLocale } from '../shared/i18n';
import { t } from '../shared/i18n';
import { useToolState, useRestoreBarrier } from './tool-session';
import { useState,useEffect,useRef } from 'react';
import { Search, FolderOpen, Copy, ExternalLink, RefreshCw, Settings, LoaderCircle, ArrowLeft, ArrowUp, ChevronRight } from 'lucide-react';
import type { FileSearchResult, FileSearchIndexStatus, FileResult, FileInfo, DirectoryPage } from '../shared/everything';
import { SPOTLIGHT_IDLE } from '../shared/spotlight';
import { api,useApp,errorText,IconButton,Empty } from './common';
import { FileIcon,fileKind } from './file-kind';
import './filesearch.css';

export function FileSearch(){
  const {state,toast,navigate}=useApp();
  const [query,setQuery]=useToolState('query',''),[selected,setSelected]=useToolState('selected','');
  const [trail,setTrail]=useToolState<string[]>('directoryTrail',[]),[filter,setFilter]=useToolState('directoryFilter',''),[browseSelected,setBrowseSelected]=useToolState('directorySelected','');
  const [result,setResult]=useState<FileSearchResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [directory,setDirectory]=useState<DirectoryPage|null>(null),[directoryBusy,setDirectoryBusy]=useState(false),[directoryError,setDirectoryError]=useState(''),[refresh,setRefresh]=useState(0);
  const [info,setInfo]=useState<FileInfo|null>(null),[infoError,setInfoError]=useState(''),[infoBusy,setInfoBusy]=useState(false);
  const [index,setIndex]=useState<FileSearchIndexStatus|null>(null),[preparationRequest,setPreparationRequest]=useState(0),[grantEpoch,setGrantEpoch]=useState(0);
  const sequence=useRef(0),directorySequence=useRef(0),input=useRef<HTMLInputElement>(null),authorized=useRef(false),loadingMore=useRef(false);
  const mac=state.platform==='darwin',linux=state.platform==='linux',scopesKey=JSON.stringify(state.settings.fileSearchPaths),previousScopes=useRef(scopesKey);
  const browsing=trail.length>0,canSearch=mac||linux||index?.status==='ready';
  const preparing=!mac&&!linux&&(!index||index.status==='preparing');
  const restoration=useRestoreBarrier();
  const [restoreWait]=useState(()=>{
    if(!restoration?.initial.directoryTrail||(restoration.initial.directoryTrail as string[]).length===0)return null;
    let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};
  });
  useEffect(()=>{if(restoreWait)restoration?.restores.add(restoreWait.promise);return()=>restoreWait?.resolve();},[]);

  const search=async(value:string)=>{
    const id=++sequence.current;authorized.current=false;setBusy(Boolean(value.trim()));setError('');
    try{
      const next=await api<FileSearchResult>('fileSearch',value);
      if(id!==sequence.current)return;
      authorized.current=next.status==='ready';setGrantEpoch(old=>old+1);
      setResult(next);setSelected(old=>next.items.some(item=>item.path===old)?old:next.items[0]?.path||'');
      if(!mac&&next.status==='indexing'){
        setIndex(old=>({status:'preparing',message:next.message,startedAt:Date.now(),version:next.version,scopes:next.scopes||old?.scopes}));
        setPreparationRequest(old=>old+1);
      }
    }catch(e){if(id===sequence.current){setError(errorText(e));setResult(null);restoreWait?.resolve();}}
    finally{if(id===sequence.current)setBusy(false);}
  };
  useEffect(()=>{input.current?.focus();},[]);
  useEffect(()=>{
    if(mac||linux)return;
    let disposed=false,timer:ReturnType<typeof setTimeout>;
    setIndex({status:'preparing',message:t("正在准备文件索引…"),startedAt:Date.now(),scopes:state.settings.fileSearchPaths});
    const check=async()=>{
      try{
        const next=await api<FileSearchIndexStatus>('fileSearchStatus');
        if(disposed)return;setIndex(next);
        if(next.status==='preparing')timer=setTimeout(()=>void check(),2000);
      }catch(e){if(!disposed)setIndex(old=>({status:'unavailable',message:errorText(e),startedAt:old?.startedAt||Date.now(),scopes:old?.scopes}));}
    };
    void check();return()=>{disposed=true;clearTimeout(timer);};
  },[mac,scopesKey,preparationRequest]);
  useEffect(()=>{
    if(previousScopes.current!==scopesKey){authorized.current=false;previousScopes.current=scopesKey;}
    if(browsing&&authorized.current)return;
    sequence.current++;setResult(null);setError('');setBusy(false);
    if(query.trim()&&!canSearch)return;
    let resolve!:()=>void;const pending=new Promise<void>(done=>{resolve=done;});
    const timer=setTimeout(()=>{void search(query).finally(resolve);},250);
    if(restoration&&'query' in restoration.initial)restoration.restores.add(pending);
    return()=>{clearTimeout(timer);resolve();sequence.current++;};
  },[query,scopesKey,canSearch,browsing]);
  useEffect(()=>{if(browsing||!mac||!query.trim()||result?.status!=='indexing')return;const timer=setTimeout(()=>void search(query),2000);return()=>clearTimeout(timer);},[mac,result,query,browsing]);
  useEffect(()=>{if(index?.status==='unavailable'||result?.status==='unavailable'||result?.status==='unsupported')restoreWait?.resolve();},[index,result]);

  useEffect(()=>{
    const id=++directorySequence.current;loadingMore.current=false;setDirectory(null);setDirectoryError('');
    if(!browsing||!authorized.current){setDirectoryBusy(false);return;}
    setDirectoryBusy(true);
    const load=async()=>{
      try{
        let page:DirectoryPage|null=null;
        // Replaying the trail reacquires grants after window handoff.
        for(let i=0;i<trail.length;i++){
          page=await api<DirectoryPage>('fileBrowse',{path:trail[i],filter:i===trail.length-1?filter:''});
          if(id!==directorySequence.current)return;
          const target=i<trail.length-1?trail[i+1]:browseSelected;
          while(target&&page.cursor&&!page.items.some(item=>item.path===target)&&!page.ancestors.some(item=>item.path===target)){
            const next:DirectoryPage=await api<DirectoryPage>('fileBrowse',{path:trail[i],filter:i===trail.length-1?filter:'',cursor:page.cursor});
            if(id!==directorySequence.current)return;
            page={...next,items:[...page.items,...next.items]};
          }
        }
        setDirectory(page);setBrowseSelected(old=>page!.items.some(item=>item.path===old)?old:'');
      }catch(e){if(id===directorySequence.current)setDirectoryError(errorText(e));}
      finally{if(id===directorySequence.current){setDirectoryBusy(false);restoreWait?.resolve();}}
    };
    const pending=load();if(restoration&&'directoryTrail' in restoration.initial)restoration.restores.add(pending);
    return()=>{directorySequence.current++;};
  },[trail,filter,grantEpoch,refresh]);

  const items=browsing?directory?.items||[]:result?.items||[],activeSelected=browsing?browseSelected:selected;
  const current=items.find(item=>item.path===activeSelected);
  useEffect(()=>{
    let disposed=false;setInfo(null);setInfoError('');setInfoBusy(Boolean(current));
    if(current)void api<FileInfo>('fileInfo',current.path).then(next=>{if(!disposed)setInfo(next);},e=>{if(!disposed)setInfoError(errorText(e));}).finally(()=>{if(!disposed)setInfoBusy(false);});
    return()=>{disposed=true;};
  },[current?.path,grantEpoch,refresh]);
  const choose=(file:string)=>browsing?setBrowseSelected(file):setSelected(file);
  const action=async(action:string,path?:string)=>{try{await api('fileAction',{action,path});if(action==='copy')toast(t("已复制文件路径"));}catch(e){toast(errorText(e),true);}};
  const enter=(file:string)=>{setFilter('');setBrowseSelected('');setTrail(old=>old.includes(file)?old.slice(0,old.indexOf(file)+1):[...old,file]);};
  const activate=(item:FileResult)=>{if(item.directory)enter(item.path);else void action('open',item.path);};
  const back=()=>{setTrail([]);setFilter('');setBrowseSelected('');};
  const retry=()=>{if(browsing&&authorized.current)setRefresh(old=>old+1);else if(mac)void search(query);else setPreparationRequest(old=>old+1);};
  const more=async()=>{
    if(!directory?.cursor||loadingMore.current)return;
    loadingMore.current=true;setDirectoryBusy(true);const id=directorySequence.current;
    try{
      const page=await api<DirectoryPage>('fileBrowse',{path:directory.path,filter,cursor:directory.cursor});
      if(id!==directorySequence.current)return;
      setDirectory(old=>({...page,items:[...old!.items,...page.items].sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name,undefined,{numeric:true}))}));
      setDirectoryError('');
    }catch(e){if(id===directorySequence.current)setDirectoryError(errorText(e));}
    finally{if(id===directorySequence.current){loadingMore.current=false;setDirectoryBusy(false);}}
  };
  const keyboard=(e:React.KeyboardEvent)=>{
    if(e.altKey&&e.key==='ArrowUp'&&directory?.parent){e.preventDefault();enter(directory.parent);return;}
    if(e.key==='Escape'&&browsing){e.preventDefault();e.stopPropagation();back();return;}
    if(!items.length)return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();const index=items.findIndex(item=>item.path===activeSelected),next=items[Math.min(items.length-1,Math.max(0,index+(e.key==='ArrowDown'?1:-1)))];choose(next.path);document.getElementById('file-result-'+items.indexOf(next))?.scrollIntoView({block:'nearest'});
    }
    if(e.key==='Enter'&&current&&(e.target===input.current||(e.target as HTMLElement).closest('.file-result'))){e.preventDefault();activate(current);}
  };
  const unavailable=!mac&&index?.status==='unavailable'?index.message:result?.status==='unavailable'?result.message:'';
  const scopes=mac?result?.scopes:index?.scopes||result?.scopes,version=index?.version||result?.version;
  const problem=browsing?directoryError||error||unavailable:unavailable||error;
  const waiting=browsing?directoryBusy&&!directory:busy;
  return <div className="file-search-panel" onKeyDown={keyboard}>
    <div className="file-search-bar"><Search size={17}/><input ref={input} aria-label={browsing?t("筛选当前文件夹"):linux?t("Linux 文件搜索"):mac?t("Spotlight 文件搜索"):t("Everything 文件搜索")} placeholder={browsing?t("按名称筛选当前文件夹"):mac||linux?t("搜索文件，支持多关键词、*.pdf 和 ext:pdf"):t("搜索文件名或路径，支持 Everything 语法")} maxLength={1024} value={browsing?filter:query} onChange={e=>browsing?setFilter(e.target.value):setQuery(e.target.value)}/><IconButton title={mac||linux?t("搜索范围设置"):t("索引范围设置")} onClick={()=>navigate('settings')}><Settings size={16}/></IconButton><IconButton title={browsing?t("刷新文件夹"):t("重新搜索")} disabled={busy||directoryBusy||(!browsing&&(!query.trim()||!canSearch))} onClick={()=>browsing?setRefresh(old=>old+1):void search(query)}><RefreshCw size={16}/></IconButton></div>
    {browsing&&<nav className="file-breadcrumbs" aria-label={t("文件夹导航")}><button onClick={back}><ArrowLeft size={14}/>{t("返回搜索")}</button><IconButton title={t("上一级")} disabled={!directory?.parent} onClick={()=>directory?.parent&&enter(directory.parent)}><ArrowUp size={16}/></IconButton><div>{directory?.ancestors.map((part,i)=><span key={part.path}>{i>0&&<ChevronRight size={12}/>}<button title={part.path} aria-current={part.path===directory.path?'location':undefined} onClick={()=>enter(part.path)}>{part.name}</button></span>)||<span>{trail.at(-1)}</span>}</div></nav>}
    <div className="file-browser-body">
      <div className="file-results">
        {(!browsing||!authorized.current)&&preparing?<IndexPreparation status={index}/>:problem&&!directory?<Empty icon={<Search size={30}/>}><span>{problem}</span><button className="button" onClick={retry}>{t("重试")}</button></Empty>:waiting?<Empty icon={<LoaderCircle className="file-search-spinner" size={30}/>}>{browsing?t("正在读取文件夹…"):mac?t("正在搜索文件…"):t("正在查询索引…")}</Empty>:!items.length&&!directory?.cursor?<Empty icon={<Search size={30}/>}>{browsing?(filter?t("当前文件夹没有匹配项"):t("此文件夹为空")):result?.message||(mac?t(SPOTLIGHT_IDLE):t("输入文件名或路径开始搜索，例如 ext:pdf 项目"))}</Empty>:<><div role="listbox" aria-label={browsing?t("文件夹内容"):t("文件搜索结果")}>{items.map((item,i)=><button id={'file-result-'+i} role="option" aria-selected={item.path===activeSelected} className="file-result" key={item.path} onClick={()=>choose(item.path)} onDoubleClick={()=>activate(item)}><FileIcon name={item.name} directory={item.directory}/><span className="file-result-name"><strong>{item.name}</strong><small title={item.path}>{browsing?fileKind(item.name,item.directory).label:item.parent}</small></span><span className="file-meta">{item.directory?t("文件夹"):fileSize(item.size)}<small>{item.modified.replace('T',' ').slice(0,16)}</small></span></button>)}</div>{directory?.cursor&&<button className="button file-load-more" disabled={directoryBusy} onClick={()=>void more()}>{directoryBusy?t("正在加载…"):t("加载更多")}</button>}{directory&&directoryError&&<div className="file-directory-error" role="alert">{directoryError}<button className="button" onClick={retry}>{t("刷新文件夹")}</button></div>}</>}
      </div>
      <aside className="file-info" aria-label={t("文件信息")}>{current?<><FileIcon name={current.name} directory={current.directory} size={38}/><h3>{current.name}</h3>{infoBusy?<p role="status">{t("正在读取信息…")}</p>:infoError?<p role="alert">{infoError}</p>:info&&<dl><dt>{t("类型")}</dt><dd>{fileKind(info.name,info.directory).label}</dd><dt>{t("完整路径")}</dt><dd className="file-info-path">{info.path}</dd>{!info.directory&&<><dt>{t("大小")}</dt><dd>{fileSize(info.size)}{info.size!==null&&info.size>=1024?t("（{{v0}} 字节）", { v0: info.size.toLocaleString(formatLocale()) }):''}</dd></>}<dt>{t("创建时间")}</dt><dd>{fileDate(info.created)}</dd><dt>{t("修改时间")}</dt><dd>{fileDate(info.modified)}</dd></dl>}<div className="file-info-actions"><button className="button" onClick={()=>activate(current)}>{current.directory?t("浏览文件夹"):t("打开文件")}</button><button className="button" onClick={()=>void action(current.directory?'open':'reveal',current.path)}>{t("在{{v0}}中打开", {v0: mac?'Finder':t("资源管理器")})}</button></div></>:<div className="file-info-placeholder"><Search size={26}/><p>{t("单击文件或文件夹")}<br/>{t("查看详细信息")}</p></div>}</aside>
    </div>
    <footer className="file-search-footer"><span title={browsing?directory?.path:scopes?.join('、')}>{browsing?t("已显示 {{v0}} 项{{v1}}", { v0: items.length, v1: directory?.cursor?t(" · 可继续加载"):'' , count: items.length }):result?.items.length?t("{{v0}} 个结果{{v1}}", { v0: result.items.length, v1: result.limited?(linux?t(" · 部分结果"):t(" · 前 200 项")):'' , count: result.items.length }):linux?t("Linux · 指定目录搜索"):mac?t("Spotlight · 系统索引"):version?`Everything ${version}`:t("内置 Everything · 本地索引")}{!browsing&&scopes?.length?t(" · {{v0}} 个{{v1}}目录", { v0: scopes.length, v1: mac||linux?t("搜索"):t("索引") }):''}{!browsing&&!mac&&index?.status==='ready'?t(" · 索引已就绪"):''}</span><span className="flex-spacer"/>{current&&<><IconButton title={current.directory?t("浏览文件夹"):t("打开文件")} onClick={()=>activate(current)}><ExternalLink size={16}/></IconButton><IconButton title={t("打开所在文件夹")} onClick={()=>void action('reveal',current.path)}><FolderOpen size={16}/></IconButton><IconButton title={t("复制文件路径")} onClick={()=>void action('copy',current.path)}><Copy size={16}/></IconButton></>}</footer>
  </div>;
}
function fileDate(value:string){if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleString(formatLocale());}

function IndexPreparation({status}:{status:FileSearchIndexStatus|null}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const elapsed=Math.max(0,Math.floor((now-(status?.startedAt||now))/1000));
  const duration=elapsed<60?t("{{v0}} 秒", { v0: elapsed }):t("{{v0}} 分 {{v1}} 秒", { v0: Math.floor(elapsed/60), v1: elapsed%60 });
  return <div className="empty-state file-index-state" role="status" aria-label={t("文件索引准备中")}><LoaderCircle className="file-search-spinner" size={30} aria-hidden="true"/><p><span>{status?.message||t("正在准备文件索引…")}</span><span className="file-index-detail">{t("已等待 {{v0}}", { v0: duration })}{status?.scopes?.length?t(" · {{v0}} 个索引目录", { v0: status.scopes.length }):''}</span><span className="file-index-hint">{t("可以先输入关键词，索引就绪后会自动搜索。")}</span></p></div>;
}
function fileSize(size:number|null){if(size===null)return '—';if(size<1024)return size+' B';if(size<1024*1024)return (size/1024).toFixed(1)+' KB';if(size<1024**3)return (size/1024**2).toFixed(1)+' MB';return (size/1024**3).toFixed(1)+' GB';}
