import { t } from '../shared/i18n';
import { SettingsSelect } from './components/settings-select';
import { Textarea } from './components/ui/textarea';
import { Input } from './components/ui/input';
import { Button } from './components/ui/button';
import { Switch } from './components/ui/switch';
import {useEffect,useState} from 'react';
import {Mouse,ExternalLink} from 'lucide-react';
import {api,errorText,useApp} from './common';
import type {PanelConfig} from '../shared/super-panel';
export function PanelSettings(){
 const {state,toast}=useApp(),config=state.panelConfig,status=state.panelStatus;
 const [shortcut,setShortcut]=useState(config.shortcut),[excluded,setExcluded]=useState(config.excludedApps.join('\n'));
 useEffect(()=>{setShortcut(config.shortcut);setExcluded(config.excludedApps.join('\n'));},[config.shortcut,config.excludedApps.join('\n')]);
 const save=async(patch:Partial<PanelConfig>)=>{try{await api('panel',{action:'config',patch:{action:'settings',revision:config.revision,patch}});toast(t("超级面板设置已保存"));}catch(e){toast(errorText(e),true);}};
 return <>
  <div className="settings-section-title"><Mouse size={17}/>{t("选区与超级面板")}</div>
  <div className="setting-row"><div><strong>{t("超级面板")}</strong><p>{t("在鼠标附近打开常用入口，并处理当前选区")}</p></div><Switch aria-label={t("启用超级面板")} checked={config.enabled} onCheckedChange={enabled=>void save({enabled})}/></div>
  <div className="setting-row"><div><strong>{t("鼠标触发")}</strong><p>{status.mouseActive?t("鼠标监听已生效"):config.mouse==='off'?t("鼠标触发已关闭"):status.error||t("等待鼠标监听就绪")}</p></div><SettingsSelect label={t("面板鼠标触发")} value={config.mouse} disabled={!config.enabled||!status.supported} onValueChange={mouse=>void save({mouse})} items={[{value:"right",label:t("长按鼠标右键")},{value:"middle",label:t("鼠标中键")},{value:"off",label:t("关闭鼠标触发")}]}/></div>
  {config.mouse==='right'&&<div className="setting-row"><div><strong>{t("右键长按时间")}</strong><p>{t("普通短按仍打开原应用右键菜单")}</p></div><SettingsSelect label={t("右键长按时间")} value={config.holdMs} onValueChange={holdMs=>void save({holdMs})} items={[200,250,300,350,400].map(value=>({value,label:`${value} ms`}))}/></div>}
  <div className="setting-row"><div><strong>{t("面板快捷键")}</strong><p>{t("留空则不注册，和已有快捷键统一检查冲突")}</p></div><div className="shortcut-control"><Input aria-label={t("面板快捷键")} value={shortcut} placeholder={t("例如 Control+Alt+Space")} onChange={e=>setShortcut(e.target.value)}/><Button variant="outline" onClick={()=>void save({shortcut})}>{t("保存")}</Button></div></div>
  {state.shortcutStatuses['@panel']?.error&&<p className="settings-warning">{state.shortcutStatuses['@panel'].error}</p>}
  <div className="panel-settings-exclusions"><label htmlFor="panel-exclusions">{t("排除应用")}</label><p>{t("每行一个应用标识或名称，例如 com.apple.Terminal、WindowsTerminal.exe；同时停用鼠标触发和自动选区获取。")}</p><Textarea id="panel-exclusions" aria-label={t("面板排除应用")} value={excluded} onChange={e=>setExcluded(e.target.value)} rows={3}/><Button variant="outline" onClick={()=>void save({excludedApps:excluded.split('\n').map(v=>v.trim()).filter(Boolean)})}>{t("保存排除列表")}</Button></div>
  <p className="setting-description">{t("选区仅在触发时读取。复制兜底会尽量恢复原剪贴板；没有获取到选区时显示常用入口。功能快捷键可在下方功能管理中单独开启“带入当前选区”。")}</p>
  <div className="tool-buttons"><Button variant="outline" disabled={!config.enabled} onClick={()=>void api('panel',{action:'open'}).catch(e=>toast(errorText(e),true))}>{t("打开超级面板")}</Button>{state.platform==='darwin'&&<Button variant="outline" onClick={()=>void api('panel',{action:'permissions'}).catch(e=>toast(errorText(e),true))}><ExternalLink size={14}/>{t("辅助功能权限")}</Button>}<Button variant="outline" onClick={()=>void api('panel',{action:'retry'}).catch(e=>toast(errorText(e),true))}>{t("重新检查权限与监听")}</Button></div>
 </>;
}
