import { t } from '../shared/i18n';
import { SettingsSelect } from './components/settings-select';
import { ShortcutInput } from './components/shortcut-input';
import { formatShortcut } from '../shared/shortcut-display';
import { Button } from './components/ui/button';
import { Switch } from './components/ui/switch';
import {PanelSettings} from './PanelSettings';
import {CommandManager} from './CommandManager';
import { UpdatePanel } from './UpdatePanel';
import { useState,useEffect } from 'react';
import { Keyboard, Palette, ClipboardList, FolderSearch, FolderOpen, Plus, X, RefreshCw, Monitor } from 'lucide-react';
import { api,useApp,errorText,PanelHeader } from './common';
import { SettingsIconButton as IconButton } from './components/settings-icon-button';
import type { Settings as SettingsType, StartupStatus } from '../shared/types';

export function SettingsPanel(){
  const {state,toast,refresh}=useApp();const [shortcut,setShortcut]=useState(state.settings.shortcut),[recording,setRecording]=useState(false),[startupBusy,setStartupBusy]=useState(false);
  useEffect(()=>{setShortcut(state.settings.shortcut);},[state.settings.shortcut]);
  const update=async(patch:Partial<SettingsType>)=>{try{await api('settings',patch);toast(t("设置已保存"));}catch(e){toast(errorText(e),true);}};
  const mac=state.platform==='darwin',linux=state.platform==='linux';
  const coexist=state.platform==='darwin'?'Control+Alt+Space':'Ctrl+Alt+Space';
  return <div className="standard-panel scroll-panel settings-panel"><PanelHeader title={t("设置")} description={t("Nexlet · 随叫随到的桌面工具")}/>
    <div className="settings-section-title"><Keyboard size={17}/>{t("快捷键与窗口")}</div>
    <div className="setting-row"><div><strong>{t("全局唤起")}</strong><p>{t("在任意应用中打开 Nexlet")}</p></div><div className="shortcut-control"><ShortcutInput platform={state.platform} aria-label={t("全局快捷键")} value={recording?t("按下组合键…"):shortcut} readOnly={recording} onValueChange={setShortcut} onKeyDown={e=>{if(!recording)return;e.preventDefault();if(['Control','Shift','Alt','Meta'].includes(e.key))return;const keys=[e.ctrlKey?'Control':null,e.metaKey?(mac?'Command':'Super'):null,e.altKey?'Alt':null,e.shiftKey?'Shift':null,e.code==='Space'?'Space':e.key.length===1?e.key.toUpperCase():e.key].filter(Boolean);setShortcut(keys.join('+'));setRecording(false);}}/><Button variant="outline" onClick={()=>setRecording(!recording)}>{recording?t("取消"):t("录制")}</Button><Button onClick={()=>void update({shortcut})}>{t("保存")}</Button></div></div>
    {state.shortcutError&&<div className="settings-warning">{state.shortcutError}<Button variant="outline" onClick={()=>void update({shortcut:coexist})}>{t("使用")}{formatShortcut(coexist,state.platform)}</Button></div>}
    <div className="setting-row"><div><strong>{t("失焦收起")}</strong><p>{t("切换到其他应用时收起主搜索框，独立窗口保持显示")}</p></div><Switch aria-label={t("失焦收起")} checked={state.settings.hideOnBlur} onCheckedChange={value=>void update({hideOnBlur:value})}/></div>
    <div className="setting-row"><div><strong>{t("开机自启动")}</strong><p>{state.startup.reason||t("登录系统后在后台运行，通过快捷键或托盘唤出")}</p>{state.platform==='win32'&&<p>{t("便携版请放在固定位置；移动后需重新开启此开关。")}</p>}</div><Switch aria-label={t("开机自启动")} checked={state.startup.enabled} disabled={!state.startup.supported||startupBusy} onCheckedChange={async value=>{setStartupBusy(true);try{const result=await api<StartupStatus>('startup',value);await refresh();toast(result.reason||(result.enabled?t("已开启开机自启动"):t("已关闭开机自启动")));}catch(e){toast(errorText(e),true);await refresh();}finally{setStartupBusy(false);}}}/></div>
    <div className="setting-row"><div><strong>{t("语言")}</strong><p>{t("切换语言不会清空正在编辑的内容")}</p></div><SettingsSelect label={t("语言")} value={state.settings.language} onValueChange={language=>void update({language})} items={[{value:'system',label:t("跟随系统")},{value:'zh-CN',label:'简体中文'},{value:'zh-Hant',label:'繁體中文'},{value:'en',label:'English'}]}/></div>
    <div className="settings-section-title"><Palette size={17}/>{t("外观")}</div><div className="setting-row"><div><strong>{t("主题")}</strong></div><SettingsSelect label={t("主题")} value={state.settings.theme} onValueChange={theme=>void update({theme})} items={[{value:"system",label:t("跟随系统")},{value:"light",label:t("浅色")},{value:"dark",label:t("深色")}]}/></div>
    <div className="settings-section-title"><ClipboardList size={17}/>{t("剪贴板")}</div><div className="setting-row"><div><strong>{t("记录剪贴板历史")}</strong><p>{t("仅保存在本机；暂停后仍可查看已有记录")}</p></div><Switch aria-label={t("记录剪贴板历史")} checked={state.settings.clipboardEnabled} onCheckedChange={value=>void update({clipboardEnabled:value})}/></div>
    <div className="setting-row"><div><strong>{t("保留条数")}</strong><p>{t("超出数量时清理最早的非收藏记录")}</p></div><SettingsSelect label={t("保留条数")} value={state.settings.maxClipboardItems} onValueChange={maxClipboardItems=>void update({maxClipboardItems})} items={[100,500,1000,3000,5000].map(value=>({value,label:t("{{v0}} 条", { v0: value , count: value })}))}/></div>
    <div className="setting-row"><div><strong>{t("保留时间")}</strong><p>{t("收藏记录不自动清理")}</p></div><SettingsSelect label={t("保留天数")} value={state.settings.retentionDays} onValueChange={retentionDays=>void update({retentionDays})} items={[7,30,90,365,3650].map(value=>({value,label:value===3650?t("10 年"):t("{{v0}} 天", { v0: value , count: value })}))}/></div>
    <div className="settings-section-title"><FolderSearch size={17}/>{t("应用和快捷方式搜索")}</div><p className="setting-description">{state.platform==='win32'?t("自动搜索开始菜单、桌面快捷方式与 Windows 应用。"):linux?t("自动搜索 XDG 目录中的 Linux 应用。"):t("自动搜索系统和用户 Applications 文件夹。")}{t("支持中文、拼音和首字母。")}</p>
    <div className="search-paths">{state.settings.searchPaths.map(folder=><div key={folder}><FolderOpen size={16}/><span title={folder}>{folder}</span><IconButton title={t("移除目录 ")+folder} onClick={()=>void update({searchPaths:state.settings.searchPaths.filter(p=>p!==folder)})}><X size={15}/></IconButton></div>)}</div>
    <div className="tool-buttons"><Button variant="outline" onClick={async()=>{try{const folder=await api<string|null>('pickSearchPath');if(folder&&!state.settings.searchPaths.includes(folder))await update({searchPaths:[...state.settings.searchPaths,folder]});}catch(e){toast(errorText(e),true);}}}><Plus size={16}/>{t("添加搜索目录")}</Button><Button variant="outline" disabled={state.catalogLoading} onClick={()=>void api('rescan').then(()=>toast(t("索引已刷新"))).catch(e=>toast(errorText(e),true))}><RefreshCw size={16}/>{state.catalogLoading?t("正在索引…"):t("重新扫描")}</Button></div>
    {(state.platform==='win32'||mac||linux)&&<><div className="settings-section-title"><FolderSearch size={17}/>{linux?t("Linux 文件搜索"):mac?t("Spotlight 文件搜索"):t("Everything 文件索引")}</div><p className="setting-description">{linux?t("仅搜索下方添加的目录，支持文件名、多关键词、*.pdf 和 ext:pdf。跳过隐藏项与符号链接；最多返回 200 条，搜索超时会提示缩小范围。"):mac?t("使用 macOS 系统索引，无需安装额外引擎。默认搜索 Spotlight 可用范围；添加目录后只搜索指定范围。此设置不会改变系统索引，未索引或被 Spotlight 排除的文件可能无法找到。"):t("内置便携引擎，无需另行安装。默认索引本地固定磁盘中当前用户可访问的文件；首次扫描可能较久。添加目录后改为仅索引指定范围。")}</p>
    <div className="search-paths">{state.settings.fileSearchPaths.map(folder=><div key={folder}><FolderOpen size={16}/><span title={folder}>{folder}</span><IconButton title={(mac||linux?t("移除搜索目录 "):t("移除索引目录 "))+folder} onClick={()=>void update({fileSearchPaths:state.settings.fileSearchPaths.filter(p=>p!==folder)})}><X size={15}/></IconButton></div>)}</div>
    <div className="tool-buttons"><Button variant="outline" onClick={async()=>{try{const folder=await api<string|null>('pickSearchPath');if(folder&&!state.settings.fileSearchPaths.includes(folder))await update({fileSearchPaths:[...state.settings.fileSearchPaths,folder]});}catch(e){toast(errorText(e),true);}}}><Plus size={16}/>{mac||linux?t("添加文件搜索目录"):t("添加索引目录")}</Button>{state.settings.fileSearchPaths.length>0?<Button variant="outline" onClick={()=>void update({fileSearchPaths:[]})}>{linux?t("清空搜索目录"):mac?t("恢复 Spotlight 默认范围"):t("恢复全部本地磁盘")}</Button>:<span className="subtle">{linux?t("请添加要搜索的目录"):mac?t("当前：Spotlight 默认范围"):t("当前：全部本地固定磁盘")}</span>}</div></>}
    {state.nativeStatus&&<div className="settings-warning">{state.nativeStatus}</div>}
    <div className="settings-section-title"><Monitor size={17}/>{t("关于与数据")}</div><div className="setting-row"><div><strong>Nexlet {state.version}</strong><p>{state.platform==='win32'?'Windows':state.platform==='darwin'?'macOS':state.platform}{t("· 本地存储")}</p></div><Button variant="outline" onClick={()=>void api('openData').catch(e=>toast(errorText(e),true))}><FolderOpen size={16}/>{t("打开数据目录")}</Button></div>
    <PanelSettings/>
    <CommandManager/>
    <UpdatePanel/>
  </div>;
}
