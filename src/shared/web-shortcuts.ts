import type {Command,WebShortcut} from './types';

function safeURL(value:string){const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw Error('仅支持不含账号密码的 HTTP(S) 网址');return url;}
export function validateWebShortcut(raw:unknown):WebShortcut {
  if(!raw||typeof raw!=='object')throw Error('网页配置无效');
  const w=raw as WebShortcut;
  if(typeof w.id!=='string'||!w.id||w.id.length>100||typeof w.name!=='string'||!w.name.trim()||w.name.length>60||typeof w.url!=='string'||!w.url.trim()||w.url.length>2048||/[\0\r\n\\]/.test(w.url))throw Error('名称或网页地址无效');
  if(w.type!==undefined&&!['fixed','search'].includes(w.type))throw Error('网页类型无效');
  const value=w.url.trim();
  if(w.type==='search'){
    const authority=value.match(/^https?:\/\/[^/?#]+/i)?.[0];
    if(!authority||authority.includes('{')||!value.includes('{query}')||/[{}]/.test(value.replaceAll('{query}','')))throw Error('搜索模板须在路径或查询中包含 {query}，不能改变协议或主机');
    safeURL(value.replaceAll('{query}','example'));
    return {id:w.id,name:w.name.trim(),url:value,type:'search'};
  }
  return {id:w.id,name:w.name.trim(),url:safeURL(value).href,...(w.type?{type:w.type}:{})};
}
export function resolveWebShortcut(raw:WebShortcut,query=''):string {
  const entry=validateWebShortcut(raw);
  if(entry.type!=='search')return entry.url;
  if(!query.trim())throw Error('请输入搜索内容');
  if(query.length>10000)throw Error('搜索内容最多 10000 字符');
  return safeURL(entry.url.replaceAll('{query}',encodeURIComponent(query.trim()))).href;
}
export function webSearchCommands(entries:WebShortcut[],query:string,aliases:Record<string,string[]>={}):Command[]{
  query=query.trimStart();
  return entries.filter(e=>e.type==='search').flatMap(entry=>{
    const names=[entry.name,...(aliases['web:'+entry.id]||[])].sort((a,b)=>b.length-a.length);
    const name=names.find(n=>query.toLowerCase().startsWith(n.toLowerCase()+' '));if(!name)return [];
    const payload=query.slice(name.length).trim();if(!payload)return [];
    return [{id:'web:'+entry.id,name:entry.name,subtitle:`搜索：${payload}`,kind:'web' as const,keywords:[],payload,color:'#3188ef'}];
  });
}
