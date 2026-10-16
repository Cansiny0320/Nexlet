import { t } from '../shared/i18n';
import {useEffect,useState} from 'react';
import {ArrowUpRight,Copy,Download,Minus,Pin,Plus,RotateCw,X} from 'lucide-react';
import {errorText,IconButton} from './common';
import type {ImageToolState} from '../shared/desktop-tools';
export function ImageTools(){
 const [state,setState]=useState<ImageToolState|null>(null),[message,setMessage]=useState('');
 useEffect(()=>{const refresh=()=>{void window.desktopTools.call<ImageToolState>('state').then(value=>{setState(value);document.documentElement.dataset.theme=value.theme;});};refresh();const off=window.desktopTools.onChange(refresh);const key=(e:KeyboardEvent)=>{if(e.key==='Escape')void window.desktopTools.call('cancel');};window.addEventListener('keydown',key);return()=>{off();window.removeEventListener('keydown',key);};},[]);
 async function action(name:string,payload?:unknown,success=''){try{setMessage('');await window.desktopTools.call(name,payload);if(success)setMessage(success);}catch(error){setMessage(errorText(error));}}
 if(!state)return <div className="loading-screen">{t("正在打开图片…")}</div>;
 return <div className="image-tool image-pin">
  <header className="image-titlebar"><span><Pin size={15}/> {t("贴图")}</span><div className="image-window-actions"><IconButton title={t("缩小")} onClick={()=>void action('zoom',-.1)}><Minus size={15}/></IconButton><IconButton title={t("放大")} onClick={()=>void action('zoom',.1)}><Plus size={15}/></IconButton><IconButton title={t("旋转图片")} onClick={()=>void action('rotate')}><RotateCw size={15}/></IconButton><IconButton title={t("复制图片")} onClick={()=>void action('copy',undefined,t("图片已复制"))}><Copy size={15}/></IconButton><IconButton title={t("保存图片")} onClick={()=>void action('save')}><Download size={15}/></IconButton><IconButton title={t("送回搜索框")} onClick={()=>void action('launch')}><ArrowUpRight size={16}/></IconButton></div><IconButton title={t("关闭")} onClick={()=>void action('cancel')}><X size={17}/></IconButton></header>
  <div className="pin-picture" onWheel={e=>{e.preventDefault();void action('zoom',e.deltaY<0?.1:-.1);}}>{state.image&&<img src={state.image} alt={t("悬浮图片")} draggable={false}/>}</div>  {message&&<div className="pin-message" role="status">{message}</div>}
 </div>;
}
