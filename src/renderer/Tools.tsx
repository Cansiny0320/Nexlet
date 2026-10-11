import { useState,useEffect } from 'react';
import { Copy, WandSparkles, Minimize2, RefreshCw, ArrowRight, Plus, Trash2, Globe } from 'lucide-react';
import { api,useApp,errorText,PanelHeader,Empty,IconButton } from './common';

function encode64(value:string){const bytes=new TextEncoder().encode(value);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
function decode64(value:string){const binary=atob(value.replace(/\s/g,''));return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));}
export function ToolsPanel({tool,initial}:{tool:string;initial:string}){
  const {toast}=useApp();
  const [input,setInput]=useState(initial),[output,setOutput]=useState(''),[error,setError]=useState(''),[mode,setMode]=useState('base64'),[count,setCount]=useState(1);
  const [timestamp,setTimestamp]=useState(String(Math.floor(Date.now()/1000))),[unit,setUnit]=useState('seconds'),[date,setDate]=useState(localDateInput(new Date()));
  const copy=async(text=output)=>{try{await api('clipAction',{action:'writeText',text});toast('已复制');}catch(e){toast(errorText(e),true);}};
  function process(action:string){try{setError('');if(input.length>500000)throw new Error('文本过长，最多处理 50 万字符');
    if(tool==='json')setOutput(JSON.stringify(JSON.parse(input),null,action==='compact'?undefined:2));
    if(tool==='encoding')setOutput(mode==='base64'?(action==='encode'?encode64(input):decode64(input)):(action==='encode'?encodeURIComponent(input):decodeURIComponent(input)));
  }catch(e){setError(errorText(e));setOutput('');}}
  useEffect(()=>{if(tool==='json'&&initial)process('format');if(tool==='uuid')setOutput(crypto.randomUUID());},[]);
  if(tool==='timestamp'){
    const millis=Number(timestamp)*(unit==='seconds'?1000:1),parsed=new Date(millis),valid=timestamp.trim()!==''&&Number.isFinite(millis)&&!Number.isNaN(parsed.getTime());
    const fromDate=new Date(date),dateValid=!Number.isNaN(fromDate.getTime());
    return <div className="standard-panel scroll-panel"><PanelHeader title="时间戳" description={`本地时区：${Intl.DateTimeFormat().resolvedOptions().timeZone}`}/>
      <div className="field-label">Unix 时间戳 → 日期</div><div className="form-row"><input aria-label="Unix 时间戳" value={timestamp} onChange={e=>setTimestamp(e.target.value)} inputMode="numeric"/><select aria-label="时间戳单位" value={unit} onChange={e=>setUnit(e.target.value)}><option value="seconds">秒</option><option value="milliseconds">毫秒</option></select><button className="button" onClick={()=>setTimestamp(String(unit==='seconds'?Math.floor(Date.now()/1000):Date.now()))}>现在</button></div>
      <div className="conversion-result"><label>本地时间</label><output>{valid?parsed.toLocaleString('zh-CN',{hour12:false}):'请输入有效时间戳'}</output>{valid&&<IconButton title="复制本地时间" onClick={()=>void copy(parsed.toLocaleString('zh-CN',{hour12:false}))}><Copy size={16}/></IconButton>}</div>
      <div className="conversion-result"><label>UTC</label><output>{valid?parsed.toISOString():'—'}</output>{valid&&<IconButton title="复制 UTC 时间" onClick={()=>void copy(parsed.toISOString())}><Copy size={16}/></IconButton>}</div>
      <div className="field-label separated">日期 → Unix 时间戳</div><input className="date-input" type="datetime-local" step="1" aria-label="本地日期时间" value={date} onChange={e=>setDate(e.target.value)}/>
      <div className="conversion-result"><label>秒</label><output>{dateValid?Math.floor(fromDate.getTime()/1000):'—'}</output>{dateValid&&<IconButton title="复制秒时间戳" onClick={()=>void copy(String(Math.floor(fromDate.getTime()/1000)))}><Copy size={16}/></IconButton>}</div>
      <div className="conversion-result"><label>毫秒</label><output>{dateValid?fromDate.getTime():'—'}</output>{dateValid&&<IconButton title="复制毫秒时间戳" onClick={()=>void copy(String(fromDate.getTime()))}><Copy size={16}/></IconButton>}</div>
    </div>;
  }
  if(tool==='uuid')return <div className="standard-panel editor-tool"><PanelHeader title="UUID" description="生成 UUID v4 随机标识"/><div className="form-row"><label htmlFor="uuid-count">数量</label><input id="uuid-count" className="number-input" type="number" min="1" max="100" value={count} onChange={e=>setCount(Number(e.target.value))}/><button className="button primary" onClick={()=>{if(!Number.isInteger(count)||count<1||count>100){toast('数量应为 1–100',true);return;}setOutput(Array.from({length:count},()=>crypto.randomUUID()).join('\n'));}}><RefreshCw size={16}/>生成</button><button className="button" onClick={()=>void copy()}><Copy size={16}/>全部复制</button></div><textarea className="code-editor uuid-output" aria-label="生成的 UUID" readOnly value={output}/></div>;
  return <div className="standard-panel editor-tool"><PanelHeader title={tool==='json'?'JSON 格式化':'编码转换'} description={tool==='json'?'格式化、压缩与检查 JSON':'UTF-8 文本编码和解码'}/>
    <div className="tool-buttons">{tool==='json'?<><button className="button primary" onClick={()=>process('format')}><WandSparkles size={16}/>格式化</button><button className="button" onClick={()=>process('compact')}><Minimize2 size={16}/>压缩</button></>:<><select aria-label="编码类型" value={mode} onChange={e=>{setMode(e.target.value);setOutput('');setError('');}}><option value="base64">Base64</option><option value="url">URL 组件</option></select><button className="button primary" onClick={()=>process('encode')}>编码</button><button className="button" onClick={()=>process('decode')}>解码</button></>}<span className="flex-spacer"/><button className="button" disabled={!output} onClick={()=>void copy()}><Copy size={16}/>复制结果</button></div>
    <div className="editor-columns"><div><label>输入</label><textarea className="code-editor" aria-label="工具输入" value={input} maxLength={500000} spellCheck={false} placeholder={tool==='json'?'粘贴 JSON 内容…':'输入要转换的文本…'} onChange={e=>setInput(e.target.value)}/></div><div><label>结果</label><textarea className={`code-editor ${error?'has-error':''}`} aria-label="工具结果" readOnly value={error||output} placeholder="结果将在这里显示" spellCheck={false}/></div></div>
    <div className="tool-status">{error?<span className="error-text">{error}</span>:`${input.length} 字符`}</div>
  </div>;
}
function localDateInput(date:Date){const p=(n:number)=>String(n).padStart(2,'0');return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;}
export function WebPanel(){
  const {state,toast,dialog}=useApp();const [name,setName]=useState(''),[url,setUrl]=useState('');
  const save=async()=>{try{if(!name.trim())throw new Error('请输入名称');const target=/^https?:\/\//i.test(url.trim())?url.trim():'https://'+url.trim();const parsed=new URL(target);if(!parsed.hostname.includes('.')&&parsed.hostname!=='localhost')throw new Error('请输入完整网站地址');await api('settings',{webShortcuts:[...state.settings.webShortcuts,{id:crypto.randomUUID(),name:name.trim(),url:parsed.href}]});setName('');setUrl('');toast('已添加，可在主搜索框中搜索名称');}catch(e){toast(errorText(e),true);}};
  return <div className="standard-panel scroll-panel"><PanelHeader title="网页快开" description="添加常用网站，在主搜索框输入名称即可打开。"/><form className="web-form" onSubmit={e=>{e.preventDefault();void save();}}><input aria-label="网站名称" value={name} placeholder="名称，例如 GitHub" maxLength={60} onChange={e=>setName(e.target.value)}/><input aria-label="网站地址" value={url} placeholder="https://example.com" onChange={e=>setUrl(e.target.value)}/><button className="button primary" type="submit"><Plus size={16}/>添加</button></form>
    {!state.settings.webShortcuts.length?<Empty icon={<Globe size={30}/>}>还没有网页快捷方式</Empty>:<div className="simple-list">{state.settings.webShortcuts.map(item=><div key={item.id} className="web-item"><Globe size={24}/><button className="web-link" onClick={()=>void api('launch',{id:'web:'+item.id}).catch(e=>toast(errorText(e),true))}><strong>{item.name}</strong><span>{item.url}</span></button><IconButton title={'删除 '+item.name} onClick={async()=>{if(await dialog({title:'删除网页快捷方式？',message:item.name,confirm:'删除',danger:true}))void api('settings',{webShortcuts:state.settings.webShortcuts.filter(w=>w.id!==item.id)}).catch(e=>toast(errorText(e),true));}}><Trash2 size={16}/></IconButton></div>)}</div>}
  </div>;
}
