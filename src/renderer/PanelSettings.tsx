import {useEffect,useState} from 'react';
import {Mouse,ExternalLink} from 'lucide-react';
import {api,errorText,useApp} from './common';
import type {PanelConfig} from '../shared/super-panel';
export function PanelSettings(){
 const {state,toast}=useApp(),config=state.panelConfig,status=state.panelStatus;
 const [shortcut,setShortcut]=useState(config.shortcut),[excluded,setExcluded]=useState(config.excludedApps.join('\n'));
 useEffect(()=>{setShortcut(config.shortcut);setExcluded(config.excludedApps.join('\n'));},[config.shortcut,config.excludedApps.join('\n')]);
 const save=async(patch:Partial<PanelConfig>)=>{try{await api('panel',{action:'config',patch:{action:'settings',revision:config.revision,patch}});toast('超级面板设置已保存');}catch(e){toast(errorText(e),true);}};
 return <>
  <div className="settings-section-title"><Mouse size={17}/>选区与超级面板</div>
  <div className="setting-row"><div><strong>超级面板</strong><p>在鼠标附近打开常用入口，并处理当前选区</p></div><button role="switch" aria-label="启用超级面板" aria-checked={config.enabled} className={'toggle '+(config.enabled?'on':'')} onClick={()=>void save({enabled:!config.enabled})}><i/></button></div>
  <div className="setting-row"><div><strong>鼠标触发</strong><p>{status.mouseActive?'鼠标监听已生效':config.mouse==='off'?'鼠标触发已关闭':status.error||'等待鼠标监听就绪'}</p></div><select aria-label="面板鼠标触发" value={config.mouse} disabled={!config.enabled||!status.supported} onChange={e=>void save({mouse:e.target.value as PanelConfig['mouse']})}><option value="right">长按鼠标右键</option><option value="middle">鼠标中键</option><option value="off">关闭鼠标触发</option></select></div>
  {config.mouse==='right'&&<div className="setting-row"><div><strong>右键长按时间</strong><p>普通短按仍打开原应用右键菜单</p></div><select aria-label="右键长按时间" value={config.holdMs} onChange={e=>void save({holdMs:Number(e.target.value)})}>{[200,250,300,350,400].map(n=><option key={n} value={n}>{n} ms</option>)}</select></div>}
  <div className="setting-row"><div><strong>面板快捷键</strong><p>留空则不注册，和已有快捷键统一检查冲突</p></div><div className="shortcut-control"><input aria-label="面板快捷键" value={shortcut} placeholder="例如 Control+Alt+Space" onChange={e=>setShortcut(e.target.value)}/><button className="button" onClick={()=>void save({shortcut})}>保存</button></div></div>
  {state.shortcutStatuses['@panel']?.error&&<p className="settings-warning">{state.shortcutStatuses['@panel'].error}</p>}
  <div className="panel-settings-exclusions"><label htmlFor="panel-exclusions">排除应用</label><p>每行一个应用标识或名称，例如 com.apple.Terminal、WindowsTerminal.exe；同时停用鼠标触发和自动选区获取。</p><textarea id="panel-exclusions" aria-label="面板排除应用" value={excluded} onChange={e=>setExcluded(e.target.value)} rows={3}/><button className="button" onClick={()=>void save({excludedApps:excluded.split('\n').map(v=>v.trim()).filter(Boolean)})}>保存排除列表</button></div>
  <p className="setting-description">选区仅在触发时读取。复制兜底会尽量恢复原剪贴板；没有获取到选区时显示常用入口。功能快捷键可在下方功能管理中单独开启“带入当前选区”。</p>
  <div className="tool-buttons"><button className="button" disabled={!config.enabled} onClick={()=>void api('panel',{action:'open'}).catch(e=>toast(errorText(e),true))}>打开超级面板</button>{state.platform==='darwin'&&<button className="button" onClick={()=>void api('panel',{action:'permissions'}).catch(e=>toast(errorText(e),true))}><ExternalLink size={14}/>辅助功能权限</button>}<button className="button" onClick={()=>void api('panel',{action:'retry'}).catch(e=>toast(errorText(e),true))}>重新检查权限与监听</button></div>
 </>;
}
