import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from 'react';
import { ClipboardList, Calculator, Blocks, Globe, Braces, Clock3, Binary, Fingerprint, Settings, AppWindow, FileSymlink, Pin, X, Check, Search, FileSearch, LockKeyhole, Moon, RotateCw, Power, LogOut, Monitor } from 'lucide-react';
import type { AppState, Command, HostAction } from '../shared/types';
import { builtInArtwork } from './tool-artwork';

export const api=<T,>(action:HostAction,payload?:unknown)=>window.nexlet.call<T>(action,payload);
export const errorText=(error:unknown)=>error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /,'') : String(error);
export interface DialogSpec { title:string; message?:string; input?:string; placeholder?:string; confirm?:string; danger?:boolean; }
export interface AppContextValue { detach:()=>Promise<void>; canDetach:boolean; state:AppState; refresh:()=>Promise<void>; toast:(message:string,error?:boolean)=>void; dialog:(spec:DialogSpec)=>Promise<string|boolean|null>; navigate:(view:string,payload?:string)=>void; }
export const AppContext=createContext<AppContextValue|null>(null);
export function useApp(){const ctx=useContext(AppContext);if(!ctx)throw new Error('App context missing');return ctx;}
export function ToolIcon({command,size=32}:{command:Command;size?:number}){
  if(command.icon?.startsWith('data:image/'))return <img className="tool-image" src={command.icon} width={size} height={size} alt="" draggable={false}/>;
  if(builtInArtwork[command.id])return <img className="tool-image" src={builtInArtwork[command.id]} width={size} height={size} alt="" draggable={false}/>;
  const key=command.id.startsWith('tool:')?command.id.slice(5):command.kind;
  const icons:Record<string,typeof ClipboardList>={clipboard:ClipboardList,scratchpad:Calculator,plugins:Blocks,web:Globe,json:Braces,filesearch:FileSearch,timestamp:Clock3,encoding:Binary,uuid:Fingerprint,settings:Settings,plugin:Blocks,app:AppWindow,shortcut:FileSymlink,match:Search};
  const systemIcons:Record<string,typeof Settings>={lock:LockKeyhole,sleep:Moon,restart:RotateCw,shutdown:Power,logout:LogOut,desktop:Monitor};
  const Icon=command.kind==='system'?(command.id.startsWith('system:action:')?systemIcons[command.id.slice(14)]||Settings:Settings):icons[key]||AppWindow;
  return <span className="tool-icon" style={{background:command.color||'#648fe5',width:size,height:size}}><Icon size={size*.72} strokeWidth={1.9}/></span>;
}
export function IconButton({title,children,onClick,disabled=false,active=false,className=''}:{title:string;children:ReactNode;onClick?:()=>void;disabled?:boolean;active?:boolean;className?:string}){return <button type="button" aria-label={title} title={title} disabled={disabled} className={`icon-button ${active?'active':''} ${className}`} onClick={onClick}>{children}</button>;}
export function Empty({children,icon}:{children:ReactNode;icon?:ReactNode}){return <div className="empty-state">{icon}<p>{children}</p></div>;}
export function useAsyncAction(){const {toast}=useApp();return async<T,>(task:()=>Promise<T>,message?:string)=>{try{const result=await task();if(message)toast(message);return result;}catch(e){toast(errorText(e),true);return undefined;}};}
export function Modal({spec,onResolve}:{spec:DialogSpec;onResolve:(result:string|boolean|null)=>void}){
  const [value,setValue]=useState(spec.input??'');const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{input.current?.focus();input.current?.select();},[]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onResolve(null);}}><form className="modal" onSubmit={e=>{e.preventDefault();onResolve(spec.input!==undefined?value:true);}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')onResolve(null);}}>
    <h2>{spec.title}</h2>{spec.message&&<p>{spec.message}</p>}{spec.input!==undefined&&<input ref={input} value={value} placeholder={spec.placeholder} onChange={e=>setValue(e.target.value)} aria-label={spec.title}/>}
    <div className="modal-actions"><button type="button" className="button quiet" onClick={()=>onResolve(null)}>取消</button><button type="submit" className={`button ${spec.danger?'danger':'primary'}`}>{spec.confirm||'确定'}</button></div>
  </form></div>;
}
export function PanelHeader({title,description,children}:{title:string;description?:string;children?:ReactNode}){return <div className="panel-heading"><div><h2>{title}</h2>{description&&<p>{description}</p>}</div>{children}</div>;}
export function relativeTime(time:number){const seconds=Math.max(0,Math.floor((Date.now()-time)/1000));return seconds<60?'刚刚':seconds<3600?`${Math.floor(seconds/60)} 分钟前`:seconds<86400?`${Math.floor(seconds/3600)} 小时前`:`${Math.floor(seconds/86400)} 天前`;}
