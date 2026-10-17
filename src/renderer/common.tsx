import { t } from '../shared/i18n';
import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from 'react';
import { ClipboardList, Calculator, Blocks, Globe, Braces, Clock3, Binary, Fingerprint, Settings, AppWindow, FileSymlink, Search, FileSearch, LockKeyhole, Moon, RotateCw, Power, LogOut, Monitor, SlidersHorizontal } from 'lucide-react';
import type { AppState, Command, HostAction } from '../shared/types';
import { builtInArtwork } from './tool-artwork';
import { MATCH_TARGETS } from '../shared/command-config';
import { systemSettingIcons } from './system-setting-icons';

export const api=<T,>(action:HostAction,payload?:unknown)=>window.nexlet.call<T>(action,payload);
export const errorText=(error:unknown)=>error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /,'') : String(error);
export interface DialogSpec { title:string; message?:string; input?:string; placeholder?:string; confirm?:string; danger?:boolean; }
export interface AppContextValue { detach:()=>Promise<void>; canDetach:boolean; state:AppState; refresh:()=>Promise<void>; toast:(message:string,error?:boolean)=>void; dialog:(spec:DialogSpec)=>Promise<string|boolean|null>; navigate:(view:string,payload?:string)=>void; }
export const AppContext=createContext<AppContextValue|null>(null);
export function useApp(){const ctx=useContext(AppContext);if(!ctx)throw new Error('App context missing');return ctx;}
export function ToolIcon({command,size=32}:{command:Command;size?:number}){
  const setting=command.kind==='system'&&command.id.startsWith('system:settings:')?systemSettingIcons[command.id.slice('system:settings:'.length)]:undefined;
  if(setting)return <img className="tool-image" src={setting} width={size} height={size} alt="" draggable={false}/>;
  if(command.icon?.startsWith('data:image/'))return <img className="tool-image" src={command.icon} width={size} height={size} alt="" draggable={false}/>;
  const artwork=builtInArtwork[MATCH_TARGETS[command.id]||command.id];
  if(artwork)return <img className="tool-image" src={artwork} width={size} height={size} alt="" draggable={false}/>;
  const key=command.id.startsWith('tool:')?command.id.slice(5):command.kind;
  const icons:Record<string,typeof ClipboardList>={clipboard:ClipboardList,scratchpad:Calculator,plugins:Blocks,web:Globe,json:Braces,filesearch:FileSearch,timestamp:Clock3,encoding:Binary,uuid:Fingerprint,settings:Settings,plugin:Blocks,app:AppWindow,shortcut:FileSymlink,match:Search};
  const systemIcons:Record<string,typeof Settings>={lock:LockKeyhole,sleep:Moon,restart:RotateCw,shutdown:Power,logout:LogOut,desktop:Monitor};
  const Icon=(command.kind==='system'?(command.id.startsWith('system:action:')?systemIcons[command.id.slice(14)]||SlidersHorizontal:Settings):icons[key]||AppWindow);
  return <span className="tool-icon" style={{background:command.color||'#648fe5',width:size,height:size}}><Icon size={size*.72} strokeWidth={1.9}/></span>;
}
export function IconButton({title,children,onClick,disabled=false,active=false,className=''}:{title:string;children:ReactNode;onClick?:()=>void;disabled?:boolean;active?:boolean;className?:string}){return <button type="button" aria-label={title} title={title} disabled={disabled} className={`icon-button ${active?'active':''} ${className}`} onClick={onClick}>{children}</button>;}
export function Empty({children,icon}:{children:ReactNode;icon?:ReactNode}){return <div className="empty-state">{icon}<p>{children}</p></div>;}
export function Modal({spec,onResolve}:{spec:DialogSpec;onResolve:(result:string|boolean|null)=>void}){
  const [value,setValue]=useState(spec.input??'');const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{input.current?.focus();input.current?.select();},[]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onResolve(null);}}><form className="modal" onSubmit={e=>{e.preventDefault();onResolve(spec.input!==undefined?value:true);}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')onResolve(null);}}>
    <h2>{spec.title}</h2>{spec.message&&<p>{spec.message}</p>}{spec.input!==undefined&&<input ref={input} value={value} placeholder={spec.placeholder} onChange={e=>setValue(e.target.value)} aria-label={spec.title}/>}
    <div className="modal-actions"><button type="button" className="button quiet" onClick={()=>onResolve(null)}>{t("取消")}</button><button type="submit" className={`button ${spec.danger?'danger':'primary'}`}>{spec.confirm||t("确定")}</button></div>
  </form></div>;
}
export function PanelHeader({title,description,children}:{title:string;description?:string;children?:ReactNode}){return <div className="panel-heading"><div><h2>{title}</h2>{description&&<p>{description}</p>}</div>{children}</div>;}
export function relativeTime(time:number){const seconds=Math.max(0,Math.floor((Date.now()-time)/1000));return seconds<60?t("刚刚"):seconds<3600?t("{{v0}} 分钟前", { v0: Math.floor(seconds/60) , count: Math.floor(seconds/60) }):seconds<86400?t("{{v0}} 小时前", { v0: Math.floor(seconds/3600) , count: Math.floor(seconds/3600) }):t("{{v0}} 天前", { v0: Math.floor(seconds/86400) , count: Math.floor(seconds/86400) });}
