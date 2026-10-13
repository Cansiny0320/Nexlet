import type { Command } from './types';

export type InputSource = 'input' | 'paste' | 'drop' | 'selection' | 'capture';
export interface InputResource { id:string; name:string; size:number; isDirectory:boolean; path?:string; mime?:string; }
export type LaunchInput = { id:string; from:InputSource } & (
  { type:'text'; text:string } |
  { type:'files'; files:InputResource[] } |
  { type:'image'; image:InputResource }
);
export type ContentMatch =
  | { type:'text'; minLength?:number; maxLength?:number }
  | { type:'regex'; pattern:string; flags?:string; minLength?:number; maxLength?:number }
  | { type:'image' }
  | { type:'files'; extensions?:string[]; fileType?:'file'|'directory'; minCount?:number; maxCount?:number };
export interface SearchResponse { input:LaunchInput; results:Command[]; matches:Command[]; warning?:string; cancelled?:boolean; }
export type PluginContext = { id:string; code:string; from:InputSource } & (
  { type:'text'; payload:string } |
  { type:'files'; payload:InputResource[] } |
  { type:'image'; payload:InputResource }
);
export const INPUT_TEXT_LIMIT = 500_000;
export const INPUT_FILE_LIMIT = 100;
export const INPUT_RESOURCE_LIMIT = 20 * 1024 * 1024;
export const INPUT_TOTAL_LIMIT = 64 * 1024 * 1024;
export const REGEX_INPUT_LIMIT = 10_000;

export function inputContext(input:LaunchInput,code:string):PluginContext {
  const base={id:input.id,code,from:input.from};
  if(input.type==='text')return {...base,type:'text',payload:input.text};
  if(input.type==='files')return {...base,type:'files',payload:input.files};
  return {...base,type:'image',payload:input.image};
}
export function textInput(value:string,from:InputSource='input'):LaunchInput {
  // Used only for direct command activation; captured launcher input has a host UUID.
  return {id:'',type:'text',text:value,from};
}
export function matchesMetadata(rule:ContentMatch,input:LaunchInput):boolean {
  if(rule.type==='image')return input.type==='image';
  if(rule.type==='files'){
    if(input.type!=='files'||!input.files.length||input.files.length<(rule.minCount??1)||input.files.length>(rule.maxCount??INPUT_FILE_LIMIT))return false;
    return input.files.every(file=>(!rule.fileType||(rule.fileType==='directory')===file.isDirectory)&&(!rule.extensions||!file.isDirectory&&rule.extensions.includes(file.name.split('.').slice(1).pop()?.toLowerCase()||'')));
  }
  if(input.type!=='text'||!input.text.length)return false;
  return input.text.length>=(rule.minLength??1)&&input.text.length<=(rule.maxLength??(rule.type==='regex'?REGEX_INPUT_LIMIT:INPUT_TEXT_LIMIT));
}

export function validateMatches(value:unknown):ContentMatch[] {
  if(!Array.isArray(value)||value.length>10)throw new Error('内容匹配规则最多 10 项');
  return value.map(raw=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('内容匹配规则无效');
    const v=raw as Record<string,unknown>;
    const range=(min:string,max:string,limit:number)=>{
      const output:Record<string,number>={};
      for(const key of [min,max])if(v[key]!==undefined){if(!Number.isInteger(v[key])||Number(v[key])<1||Number(v[key])>limit)throw new Error('匹配范围无效');output[key]=Number(v[key]);}
      if((output[min]??1)>(output[max]??limit))throw new Error('匹配范围无效');
      return output;
    };
    if(v.type==='image')return {type:'image'};
    if(v.type==='text')return {type:'text',...range('minLength','maxLength',INPUT_TEXT_LIMIT)};
    if(v.type==='regex'){
      if(typeof v.pattern!=='string'||!v.pattern||v.pattern.length>512||v.flags!==undefined&&(typeof v.flags!=='string'||!/^(?!.*(.).*\1)[imsu]*$/.test(v.flags)))throw new Error('正则表达式或 flags 无效');
      try{new RegExp(v.pattern,v.flags as string|undefined);}catch{throw new Error('正则表达式无效');}
      return {type:'regex',pattern:v.pattern,...(v.flags?{flags:v.flags as string}:{}),...range('minLength','maxLength',REGEX_INPUT_LIMIT)};
    }
    if(v.type==='files'){
      if(v.fileType!==undefined&&!['file','directory'].includes(v.fileType as string))throw new Error('文件匹配类型无效');
      if(v.extensions!==undefined&&(!Array.isArray(v.extensions)||!v.extensions.length||v.extensions.length>30||v.extensions.some(e=>typeof e!=='string'||!/^[a-z0-9_-]{1,20}$/i.test(e))))throw new Error('文件扩展名无效');
      return {type:'files',...(v.fileType?{fileType:v.fileType as 'file'|'directory'}:{}),...(v.extensions?{extensions:[...new Set((v.extensions as string[]).map(e=>e.toLowerCase()))]}:{}),...range('minCount','maxCount',INPUT_FILE_LIMIT)};
    }
    throw new Error('不支持的内容匹配类型');
  });
}
