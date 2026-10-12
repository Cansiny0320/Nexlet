import { useState,useRef,useEffect,useLayoutEffect,useCallback } from 'react';
import { Palette, LockKeyhole, LockKeyholeOpen, Trash2, PencilLine, Images, Plus, MessageSquare, Check, Circle, Info } from 'lucide-react';
import type { Scratchpad, CalcLine } from '../shared/types';
import { calculate } from '../shared/calculator';
import { api,useApp,errorText,IconButton,Empty } from './common';

const blankLine=():CalcLine=>({id:crypto.randomUUID(),expression:'',note:''});
const newPad=(expression=''):Scratchpad=>({id:crypto.randomUUID(),name:new Date().toLocaleString('zh-CN',{hour12:false}).replace(/:\d\d$/,''),createdAt:Date.now(),updatedAt:0,locked:false,color:'#e9e6df',lines:expression?[{...blankLine(),expression},blankLine()]:[blankLine()]});
const format=(value:string)=>{if(value.includes('e'))return value;const [integer,fraction]=value.split('.');return integer.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction!==undefined?'.'+fraction:'');};
export function ScratchpadPanel({initialExpression}:{initialExpression:string}){
  const {toast,dialog}=useApp();
  const [pads,setPads]=useState<Scratchpad[]>([]),[active,setActive]=useState(''),[focused,setFocused]=useState(0),[saved,setSaved]=useState('已保存'),[palette,setPalette]=useState(false);
  const [focusRequest,setFocusRequest]=useState<{id:string}|null>(null);
  const current=useRef<Scratchpad[]>([]),versions=useRef(new Map<string,number>()),pending=useRef(new Map<string,Scratchpad>()),saving=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null),inputs=useRef(new Map<string,HTMLTextAreaElement>()),initialized=useRef(false);
  const updateList=(list:Scratchpad[])=>{current.current=list;setPads(list);};
  const flush=useCallback(async()=>{
    if(saving.current)return;saving.current=true;
    try{
      while(pending.current.size){const [id,snapshot]=pending.current.entries().next().value!;pending.current.delete(id);setSaved('保存中…');
        try{const result=await api<Scratchpad>('savePad',{pad:snapshot,expectedUpdatedAt:versions.current.get(id)||0});versions.current.set(id,result.updatedAt);updateList(current.current.map(p=>p.id===id?{...p,updatedAt:result.updatedAt}:p));}
        catch(e){if(!pending.current.has(id))pending.current.set(id,snapshot);setSaved('保存失败');toast(errorText(e),true);return;}
      }
      setSaved('已保存');
    }finally{saving.current=false;}
  },[toast]);
  const queue=(pad:Scratchpad)=>{updateList(current.current.some(p=>p.id===pad.id)?current.current.map(p=>p.id===pad.id?pad:p):[pad,...current.current]);pending.current.set(pad.id,pad);setSaved('未保存');if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),250);};
  const load=useCallback(async()=>{try{const list=await api<Scratchpad[]>('pads');if(pending.current.size||saving.current)return;for(const p of list)versions.current.set(p.id,p.updatedAt);updateList(list);setActive(old=>list.some(p=>p.id===old)?old:list.some(p=>p.id===localStorage.getItem('active-pad'))?localStorage.getItem('active-pad')!:list[0]?.id||'');}catch(e){toast(errorText(e),true);}},[toast]);
  useEffect(()=>{
    let live=true;
    void api<Scratchpad[]>('pads').then(list=>{if(!live)return;for(const p of list)versions.current.set(p.id,p.updatedAt);updateList(list);
      if(initialExpression&&!initialized.current){initialized.current=true;const pad=newPad(initialExpression);queue(pad);setActive(pad.id);}else{const prior=localStorage.getItem('active-pad');setActive(list.some(p=>p.id===prior)?prior!:list[0]?.id||'');}
    }).catch(e=>toast(errorText(e),true));
    const off=window.nexlet.onChange(event=>{if(event==='pads')void load();});
    return()=>{live=false;off();if(timer.current)clearTimeout(timer.current);void flush();};
  },[]);
  useEffect(()=>{if(active)localStorage.setItem('active-pad',active);},[active]);
  const pad=pads.find(p=>p.id===active);
  const focus=(index:number,id?:string)=>{setFocused(index);const row=id||current.current.find(p=>p.id===active)?.lines[index]?.id;if(row)setFocusRequest({id:row});};
  // Position the caret in the same commit as the row update, before another
  // input event can select text or move focus elsewhere.
  useLayoutEffect(()=>{const input=focusRequest&&inputs.current.get(focusRequest.id);if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);input.scrollIntoView({block:'nearest'});}},[focusRequest]);
  const add=()=>{const created=newPad();queue(created);setActive(created.id);focus(0,created.lines[0].id);};
  const editLine=(index:number,value:string)=>{if(!pad||pad.locked)return;const lines=pad.lines.map((line,i)=>i===index?{...line,expression:value}:line);if(index===lines.length-1&&value.trim()&&lines.length<1000)lines.push(blankLine());queue({...pad,lines});};
  const remark=async(index:number)=>{if(!pad||pad.locked)return;const line=pad.lines[index];const value=await dialog({title:'为当前计算添加备注',input:line.note,placeholder:'备注'});if(typeof value==='string')queue({...pad,lines:pad.lines.map((l,i)=>i===index?{...l,note:value.slice(0,1000)}:l)});};
  const clear=async()=>{if(!pad||pad.locked)return;if(await dialog({title:'清空当前稿纸？',message:'这会清空当前稿纸的公式和备注，其他稿纸不受影响。',confirm:'清空',danger:true}))queue({...pad,lines:[blankLine()]});};
  const copy=async(value:string)=>{try{await api('clipAction',{action:'writeText',text:value});toast('已复制计算结果');}catch(e){toast(errorText(e),true);}};
  const enter=(index:number)=>{if(!pad||pad.locked)return;const result=calculate(pad.lines[index].expression);if(!result.result){if(result.error)toast(result.error,true);return;}
    const lines=[...pad.lines];const carried={...blankLine(),expression:result.result};
    if(lines[index+1]&&!lines[index+1].expression.trim())lines[index+1]={...lines[index+1],expression:result.result};else lines.splice(index+1,0,carried);
    if(lines.at(-1)?.expression.trim())lines.push(blankLine());queue({...pad,lines});focus(index+1,lines[index+1].id);
  };
  useEffect(()=>{const handle=(e:KeyboardEvent)=>{if(document.querySelector('.modal-backdrop'))return;if(e.ctrlKey||e.metaKey){switch(e.key.toLowerCase()){case'n':e.preventDefault();add();break;case'b':e.preventDefault();void remark(focused);break;case'r':e.preventDefault();void clear();break;}}};window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);},[pad,focused]);
  const rename=async()=>{if(!pad)return;const name=await dialog({title:'修改稿纸名称',input:pad.name});if(typeof name==='string'&&name.trim())queue({...pad,name:name.trim().slice(0,100)});};
  const remove=async()=>{if(!pad||pad.locked)return;if(!await dialog({title:'删除当前稿纸？',message:`「${pad.name}」将被删除，其他稿纸会保留。`,confirm:'删除',danger:true}))return;try{pending.current.delete(pad.id);while(saving.current)await new Promise(r=>setTimeout(r,20));pending.current.delete(pad.id);await api('deletePad',pad.id);updateList(current.current.filter(p=>p.id!==pad.id));setActive(current.current[0]?.id||'');}catch(e){toast(errorText(e),true);}};
  const exportImage=async()=>{if(!pad)return;try{const data=renderPadImage(pad);await api('exportPad',{data});toast('稿纸图片已复制');}catch(e){toast(errorText(e),true);}};
  return <div className="scratchpad-panel"><div className="scratch-workspace">
    <div className="scratch-lines" aria-label="计算稿纸">
      {!pad&&<Empty>点击「新稿纸」开始计算</Empty>}
      {pad?.lines.map((line,index)=>{const result=calculate(line.expression);return <div className={`calc-row ${index===focused?'focused':''} ${pad.locked?'locked':''}`} key={line.id} style={{'--sheet-color':pad.color} as React.CSSProperties}>
        <textarea ref={node=>{if(node)inputs.current.set(line.id,node);else inputs.current.delete(line.id);}} value={line.expression} maxLength={512} placeholder="计算公式" aria-label={`第 ${index+1} 行计算公式`} rows={1} disabled={pad.locked} spellCheck={false} onFocus={()=>setFocused(index)} onChange={e=>editLine(index,e.target.value.replace(/[\r\n]/g,''))} onKeyDown={e=>{
          if(e.key==='Enter'){e.preventDefault();enter(index);}else if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();focus(Math.max(0,Math.min(pad.lines.length-1,index+(e.key==='ArrowUp'?-1:1))));}
          else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'&&e.currentTarget.selectionStart===e.currentTarget.selectionEnd&&result.result){e.preventDefault();void copy(result.result);}
        }}/>
        {line.note&&<div className="calc-note" onClick={()=>void remark(index)}>{line.note}</div>}
        <div className="calc-result-row"><button className="row-note-button" title="备注 (Ctrl/Cmd+B)" disabled={pad.locked} onClick={()=>void remark(index)}><MessageSquare size={14}/></button>{result.error?<span className="calc-error">{result.error}</span>:<button className={`calc-result ${result.result?'':'empty'}`} title={result.result?'复制 '+result.result:undefined} disabled={!result.result} onClick={()=>result.result&&void copy(result.result)}><span>=</span>{result.result&&<output>{format(result.result)}</output>}</button>}</div>
      </div>;})}
    </div>
    <footer className="scratch-toolbar">
      <div className="save-indicator" title={saved}>{saved==='已保存'?<Check size={12}/>:<Circle size={10}/>}<span>{saved}</span></div>
      <div className="scratch-tool-buttons">
        <IconButton title="更换输入背景色" disabled={!pad||pad.locked} onClick={()=>setPalette(!palette)}><Palette size={18}/></IconButton><i/>
        <IconButton title={pad?.locked?'解锁稿纸':'锁定稿纸（禁止编辑）'} disabled={!pad} active={pad?.locked} onClick={()=>pad&&queue({...pad,locked:!pad.locked})}>{pad?.locked?<LockKeyhole size={18}/>:<LockKeyholeOpen size={18}/>}</IconButton><i/>
        <IconButton title="删除稿纸" disabled={!pad||pad.locked} onClick={()=>void remove()}><Trash2 size={18}/></IconButton><i/>
        <IconButton title="修改稿纸名称" disabled={!pad} onClick={()=>void rename()}><PencilLine size={18}/></IconButton><i/>
        <IconButton title="稿纸复制为图片" disabled={!pad} onClick={()=>void exportImage()}><Images size={19}/></IconButton>
      </div>
      <IconButton title="支持 + - * / ^ %、括号和 sqrt / abs / sin / cos / tan / log / ln / round / min / max；Enter 续算，Ctrl/Cmd+B 备注，Ctrl/Cmd+N 新稿纸" onClick={()=>toast('Enter 续算 · Ctrl/Cmd+B 备注 · Ctrl/Cmd+N 新稿纸 · 三角函数使用弧度')}><Info size={15}/></IconButton>
      {palette&&<div className="palette-popover">{['#e9e6df','#e3edf8','#e4eee4','#f3e5e6','#ece6f5','#f1f1f1'].map(color=><button aria-label={`背景 ${color}`} key={color} style={{background:color}} onClick={()=>{if(pad)queue({...pad,color});setPalette(false);}}/>)}</div>}
    </footer>
  </div><aside className="scratch-history"><div className="pad-list">{pads.map(p=><button key={p.id} className={active===p.id?'active':''} title={p.name} onClick={()=>{void flush();setActive(p.id);setFocused(0);}}>{p.locked&&<LockKeyhole size={11}/>}<span>{p.name}</span></button>)}</div><div className="new-pad"><button onClick={add}><Plus size={17}/>新稿纸</button></div></aside></div>;
}

function renderPadImage(pad:Scratchpad):string{
  const lines=pad.lines.filter(line=>line.expression||line.note);
  const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法生成图片');
  const width=1000,padding=24;ctx.font='24px monospace';
  const wrap=(text:string,max:number)=>{const result:string[]=[];let line='';for(const character of text){if(ctx.measureText(line+character).width>max){result.push(line);line='';}line+=character;}result.push(line);return result;};
  const layout=lines.map(line=>({line,formula:wrap(line.expression,width-2*padding),note:wrap(line.note,width-2*padding)}));
  const height=70+layout.reduce((total,row)=>total+Math.max(96,row.formula.length*32+(row.line.note?row.note.length*24:0)+52),0);
  if(height>16000)throw new Error('稿纸过长，请拆分后再导出图片');
  canvas.width=width;canvas.height=height;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#333';ctx.font='22px sans-serif';ctx.fillText(pad.name,padding,42);
  let y=70;for(const row of layout){const h=Math.max(96,row.formula.length*32+(row.line.note?row.note.length*24:0)+52);ctx.fillStyle=pad.color;ctx.fillRect(0,y,width,h-2);ctx.fillStyle='#151515';ctx.font='24px monospace';row.formula.forEach((line,i)=>ctx.fillText(line,padding,y+34+i*32));if(row.line.note){ctx.fillStyle='#777';ctx.font='17px sans-serif';row.note.forEach((line,i)=>ctx.fillText(line,padding,y+34+row.formula.length*32+i*24));}const result=calculate(row.line.expression);ctx.textAlign='right';ctx.fillStyle=result.error?'#b03535':'#111';ctx.font='26px monospace';ctx.fillText(result.error||'= '+(result.result||''),width-padding,y+h-16);ctx.textAlign='left';y+=h;}
  return canvas.toDataURL('image/png');
}
