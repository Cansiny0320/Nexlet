import { Worker } from 'node:worker_threads';
import path from 'node:path';
import type { Command } from '../shared/types';
import { matchesMetadata, type LaunchInput, type SearchResponse } from '../shared/launch';
import { searchCommands } from '../shared/search';
import { calculate } from '../shared/calculator';

interface RegexResult { matched:string[]; timedOut?:boolean; cancelled?:boolean; }
export class ContentMatcher {
  private pending=new Map<number,()=>void>();
  cancel(owner:number){this.pending.get(owner)?.();}
  close(){for(const cancel of this.pending.values())cancel();this.pending.clear();}
  async search(owner:number,commands:Command[],input:LaunchInput,query:string,recent:string[]):Promise<SearchResponse>{
    this.cancel(owner);
    const response:SearchResponse={input,results:[],matches:[]};
    const content=new Set<string>(),regex:{id:string;pattern:string;flags?:string}[]=[];
    let capped=false;
    for(const command of commands)for(const rule of command.matches||[]){
      if(!matchesMetadata(rule,input))continue;
      if(rule.type==='regex'){if(regex.length<128)regex.push({id:command.id,pattern:rule.pattern,flags:rule.flags});else capped=true;}
      else content.add(command.id);
    }
    if(input.type==='text'&&regex.length){
      const result=await this.regex(owner,regex,input.text);
      if(result.cancelled)return {...response,cancelled:true};
      result.matched.forEach(id=>content.add(id));
      if(result.timedOut)response.warning='部分内容匹配规则超时，已跳过；普通搜索仍可使用';
    }
    if(capped)response.warning='内容匹配规则较多，本次仅检查前 128 条正则规则';
    const attach=(c:Command):Command=>({...c,inputId:input.id});
    const candidates=input.type==='text'?commands:commands.filter(c=>content.has(c.id));
    response.results=input.type==='text'&&query.length<=1024?searchCommands(commands,query,recent).map(attach):[];
    const ids=new Set(response.results.map(c=>c.id));
    const matching=candidates.filter(c=>content.has(c.id)&&!ids.has(c.id));
    const ordered=input.type!=='text'&&query.trim()?searchCommands(matching,query,recent):matching.sort((a,b)=>{
      const ai=recent.indexOf(a.id),bi=recent.indexOf(b.id);
      return (ai<0?Infinity:ai)-(bi<0?Infinity:bi)||a.name.localeCompare(b.name,'zh-CN');
    });
    response.matches=ordered.slice(0,60).map(attach);
    const builtins=builtinMatches(input);
    response.matches.push(...(input.type!=='text'&&query.trim()?searchCommands(builtins,query):builtins).map(attach));
    return response;
  }
  private regex(owner:number,rules:{id:string;pattern:string;flags?:string}[],text:string):Promise<RegexResult>{
    return new Promise(resolve=>{
      const worker=new Worker(path.join(__dirname,'match-worker.cjs'),{workerData:{rules,text},resourceLimits:{maxOldGenerationSizeMb:32}});
      let done=false;
      const finish=(value:RegexResult)=>{if(done)return;done=true;clearTimeout(timer);if(this.pending.get(owner)===cancel)this.pending.delete(owner);void worker.terminate();resolve(value);};
      const cancel=()=>finish({matched:[],cancelled:true});
      const timer=setTimeout(()=>finish({matched:[],timedOut:true}),1000);
      this.pending.set(owner,cancel);
      worker.once('message',result=>finish(result));
      worker.once('error',()=>finish({matched:[],timedOut:true}));
      worker.once('exit',()=>finish({matched:[],timedOut:true}));
    });
  }
}

function builtinMatches(input:LaunchInput):Command[]{
  const command=(id:string,name:string,subtitle:string,color:string,payload?:string):Command=>({id,name,subtitle,color,kind:'match',keywords:[],payload});
  if(input.type!=='text')return [command('match:collect','收进剪贴板','将本次输入保存到剪贴板历史','#6962ff')];
  const q=input.text.trim();if(!q)return [];
  const output:Command[]=[];
  if(q.length<=512){const calc=calculate(q);if(calc.result&&/[0-9]/.test(q))output.push(command('match:calc',calc.result,`${q} = ${calc.result} · 打开计算稿纸`,'#ff9c00',input.text));}
  if(q.length<=2048&&/^https?:\/\//i.test(q))output.push(command('input:url','打开链接',q,'#3387f7',q));
  if(/^[{[]/.test(q))output.push(command('match:json','JSON 格式化','将输入内容带入 JSON 工具','#42a869',input.text));
  if(/^\d{10}(?:\d{3})?$/.test(q)){const date=new Date(Number(q)*(q.length===10?1000:1));if(!Number.isNaN(date.getTime()))output.push(command('match:timestamp',date.toLocaleString('zh-CN',{hour12:false}),`${q} · 打开时间戳工具`,'#ef6863',q));}
  output.push(command('match:clipboard','剪贴板搜索','在剪贴板历史中搜索当前内容','#6962ff',input.text));
  return output;
}
