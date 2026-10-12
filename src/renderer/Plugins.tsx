import { useState, useEffect } from 'react';
import { PackagePlus, FolderOpen, Puzzle, Trash2, Play, Pause, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { BUILTIN_COMMANDS } from '../shared/types';
import { MarketPanel } from './Marketplace';
import { api,useApp,errorText,PanelHeader,ToolIcon,Empty,IconButton } from './common';

const permissionNames:Record<string,string>={'clipboard.read':'读取剪贴板','clipboard.write':'写入剪贴板','shell.openExternal':'打开外部链接','network.request':'连接已授权的服务地址','secrets':'插件独立加密密钥'};
export function PluginsPanel(){
  const {state,toast,dialog,navigate}=useApp();const [busy,setBusy]=useState(false),[detail,setDetail]=useState<string|null>(null),[tab,setTab]=useState<'market'|'installed'>('market');
  const install=async(development:boolean)=>{setBusy(true);try{if(await api('pluginInstall',{development}))toast('插件已安装，可在主搜索框中搜索指令');}catch(e){toast(errorText(e),true);}finally{setBusy(false);}};
  return <div className="plugins-panel"><div className="plugins-navigation" role="tablist"><button role="tab" aria-selected={tab==='market'} onClick={()=>setTab('market')}>插件市场</button><button role="tab" aria-selected={tab==='installed'} onClick={()=>setTab('installed')}>已安装 <small>{state.plugins.length+BUILTIN_COMMANDS.length-2}</small></button></div>{tab==='market'?<MarketPanel/>:<div className="plugins-content"><div className="tool-buttons"><button className="button primary" disabled={busy} onClick={()=>void install(false)}><PackagePlus size={17}/>导入插件包</button><button className="button" disabled={busy} onClick={()=>void install(true)}><FolderOpen size={17}/>加载开发目录</button>{busy&&<span className="subtle">正在读取插件…</span>}</div>
    <div className="settings-section-title">已安装插件 <span>{state.plugins.length}</span></div>
    {!state.plugins.length?<div className="plugin-empty"><Puzzle size={30}/><div>还没有安装外部插件<p>支持 Nexlet 插件 ZIP 包，或包含 plugin.json 的开发目录。</p></div></div>:state.plugins.map(plugin=><div key={plugin.manifest.id} className={`plugin-record ${plugin.enabled?'':'disabled'}`}>
      <div className="plugin-record-top">{plugin.icon?<img src={plugin.icon} width={43} height={43} alt=""/>:<span className="plugin-badge"><Puzzle size={25}/></span>}<div className="plugin-info"><strong>{plugin.manifest.name}<small>v{plugin.manifest.version}</small><small>{plugin.development?'开发目录':plugin.source==='marketplace'?'市场':'本地'}</small></strong><p>{plugin.manifest.description||plugin.manifest.features.map(f=>f.name).join('、')}</p></div>
      <button className={`toggle ${plugin.enabled?'on':''}`} role="switch" aria-checked={plugin.enabled} aria-label={`${plugin.enabled?'停用':'启用'} ${plugin.manifest.name}`} onClick={()=>void api('pluginToggle',{id:plugin.manifest.id,enabled:!plugin.enabled}).catch(e=>toast(errorText(e),true))}><i/></button>
      <IconButton title="插件详情" onClick={()=>setDetail(detail===plugin.manifest.id?null:plugin.manifest.id)}>{detail===plugin.manifest.id?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</IconButton>
      <IconButton title={'卸载 '+plugin.manifest.name} onClick={async()=>{const confirmed=await dialog({title:'卸载插件？',message:`将卸载「${plugin.manifest.name}」。插件独立数据会保留，重新安装后可继续使用。`,confirm:'卸载',danger:true});if(confirmed)void api('pluginRemove',{id:plugin.manifest.id,deleteData:false}).catch(e=>toast(errorText(e),true));}}><Trash2 size={17}/></IconButton></div>
      {detail===plugin.manifest.id&&<div className="plugin-details"><p><ShieldCheck size={15}/> {plugin.manifest.permissions.map(p=>permissionNames[p]).join('、')||'仅独立存储，无系统权限'}</p><div className="plugin-features">{plugin.manifest.features.map(feature=><button key={feature.code} className="button" disabled={!plugin.enabled} onClick={()=>void api('launch',{id:`plugin:${plugin.manifest.id}:${feature.code}`}).catch(e=>toast(errorText(e),true))}><Play size={13}/>{feature.name}</button>)}</div></div>}
    </div>)}
    <div className="settings-section-title">预装工具 <span>随应用提供，无需下载</span></div><div className="builtin-list">{BUILTIN_COMMANDS.filter(c=>!['tool:settings','tool:plugins'].includes(c.id)).map(command=><button key={command.id} onClick={()=>navigate(command.id.slice(5))}><ToolIcon command={command} size={28}/><span>{command.name}</span><small>预装</small></button>)}</div></div>}
  </div>;
}
