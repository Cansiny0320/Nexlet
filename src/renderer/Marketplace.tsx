import { useEffect, useState } from 'react';
import { Puzzle, RefreshCw, Download } from 'lucide-react';
import { marketAvailability, type MarketEntry, type MarketState } from '../shared/marketplace';
import { api,useApp,errorText,IconButton,Empty } from './common';
import './plugins.css';

export function MarketPanel(){
  const {state,toast}=useApp();const [market,setMarket]=useState<MarketState|null>(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(''),[query,setQuery]=useState('');
  const refresh=async(force=false)=>{setLoading(true);try{setMarket(await api<MarketState>('marketplace',force));}catch(e){toast(errorText(e),true);}finally{setLoading(false);}};
  useEffect(()=>{void refresh();},[]);
  const install=async(entry:MarketEntry)=>{setBusy(entry.id);try{if(await api('marketInstall',entry.id))toast('插件已安装，可在主搜索框搜索指令');}catch(e){toast(errorText(e),true);}finally{setBusy('');}};
  const entries=market?.entries.filter(p=>[p.name,p.description,p.author,p.category].join(' ').toLowerCase().includes(query.toLowerCase()))||[];
  return <div className="plugins-content"><div className="market-intro"><div><strong>让常用工具，随手可用</strong><span>来自 Nexlet 开源插件仓库</span></div><span className="flex-spacer"/><input aria-label="搜索插件" placeholder="搜索插件" value={query} onChange={e=>setQuery(e.target.value)}/><IconButton title="刷新插件市场" disabled={loading} onClick={()=>void refresh(true)}><RefreshCw size={15}/></IconButton></div>
    {market?.error&&<div role="alert" className="market-message">{market.cached?'当前无法联网，正在显示上次加载的列表。':'暂时无法连接插件市场。'} {market.error}<button onClick={()=>void refresh(true)}>重试</button></div>}
    {loading&&!market?<Empty>正在加载插件市场…</Empty>:!entries.length?<Empty icon={<Puzzle size={28}/>}>{query?'没有找到相关插件':market?.error?'联网后刷新即可浏览插件；预装工具仍可直接使用。':'目前还没有上架的插件'}</Empty>:<div className="market-grid">{entries.map(entry=>{
      const installed=state.plugins.find(p=>p.manifest.id===entry.id),reason=marketAvailability(entry,state.platform,state.version,installed?{development:installed.development,version:installed.manifest.version}:undefined),current=installed&&installed.manifest.version===entry.version;
      return <article className="market-card" key={entry.id}><div className="market-card-top">{entry.icon?<img src={entry.icon} width={42} height={42} alt=""/>:<span className="plugin-badge"><Puzzle size={24}/></span>}<div><h3>{entry.name}</h3><small>{entry.author} · {entry.category}</small></div></div><p>{entry.description}</p><div className="market-card-bottom"><span>v{entry.version}</span>{current?<button className="button small" disabled={!installed.enabled} onClick={()=>void api('launch',{id:`plugin:${entry.id}:${installed.manifest.features[0].code}`}).catch(e=>toast(errorText(e),true))}>{installed.enabled?'打开':'已停用'}</button>:<button className="button primary small" title={reason||''} disabled={!!busy||!!reason} onClick={()=>void install(entry)}><Download size={13}/>{busy===entry.id?'下载中…':installed?'更新':'安装'}</button>}</div>{reason&&!current&&<div className="market-unavailable">{reason}</div>}<div className="market-platforms">{entry.platforms.map(p=>({win32:'Windows',darwin:'macOS',linux:'Linux'}[p])).join(' · ')}{entry.minHostVersion&&` · Nexlet ≥ ${entry.minHostVersion}`}</div></article>;
    })}</div>}
    <div className="market-source">索引与插件包托管于 GitHub{market?.fetchedAt&&` · ${market.cached?'缓存':'更新于'} ${new Date(market.fetchedAt).toLocaleString('zh-CN',{hour12:false})}`}</div>
  </div>;
}
