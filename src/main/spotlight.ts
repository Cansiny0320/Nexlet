import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { spotlightQuery, SPOTLIGHT_IDLE } from '../shared/spotlight';
import type { FileResult, FileSearchResult } from '../shared/everything';

export class SpotlightSearch {
  private pending=new Map<number,AbortController>();
  constructor(private paths:()=>string[]){}

  async search(owner:number,query:string):Promise<FileSearchResult>{
    this.forget(owner);
    const scopes=[...new Set(this.paths())];
    const empty={items:[],limited:false,scopes};
    if(!query.trim())return {status:'idle',message:SPOTLIGHT_IDLE,...empty};
    const expression=spotlightQuery(query);
    const controller=new AbortController(),{signal}=controller;
    this.pending.set(owner,controller);
    const timer=setTimeout(()=>controller.abort(new Error('Spotlight 搜索超时，请缩小搜索范围或重试')),5000);
    try{
      const paths=new Set<string>();
      for(const scope of scopes.length?scopes:[undefined]){
        await this.collect(expression,scope,signal,paths);
        if(paths.size>200)break;
      }
      signal.throwIfAborted();
      const metadata=Promise.all([...paths].map(async (file:string):Promise<FileResult|null>=>{
        try{
          const info=await stat(file),directory=info.isDirectory();
          return {path:file,name:path.basename(file)||file,parent:path.dirname(file),size:directory?null:info.size,modified:info.mtime.toISOString(),directory};
        }catch{return null;}
      }));
      let abortMetadata!:()=>void;
      const cancelled=new Promise<never>((_,reject)=>{abortMetadata=()=>reject(signal.reason);signal.addEventListener('abort',abortMetadata,{once:true});});
      let rows:(FileResult|null)[];
      try{rows=await Promise.race([metadata,cancelled]);}
      finally{signal.removeEventListener('abort',abortMetadata);}
      signal.throwIfAborted();
      const items=rows.filter((row):row is FileResult=>row!==null).slice(0,200);
      return {status:'ready',message:items.length?'':'没有找到相关文件；尚未被 Spotlight 索引或被排除的文件可能无法找到',items,limited:paths.size>200,scopes};
    }catch(error){
      if(signal.aborted&&signal.reason?.name==='AbortError')return {status:'idle',message:'',...empty};
      return {status:'unavailable',message:signal.aborted?String(signal.reason.message):'Spotlight 搜索失败，请检查搜索目录是否可访问后重试',...empty};
    }finally{
      clearTimeout(timer);
      if(this.pending.get(owner)===controller)this.pending.delete(owner);
    }
  }

  private collect(expression:string,scope:string|undefined,signal:AbortSignal,paths:Set<string>):Promise<void>{
    signal.throwIfAborted();
    return new Promise((resolve,reject)=>{
      const child=spawn('/usr/bin/mdfind',['-0',...(scope?['-onlyin',scope]:[]),expression],{stdio:['ignore','pipe','pipe']});
      let buffer='',settled=false;
      const finish=(error?:Error,kill=false)=>{
        if(settled)return;
        settled=true;signal.removeEventListener('abort',abort);
        if(kill)child.kill();
        if(error)reject(error);else resolve();
      };
      const abort=()=>finish(signal.reason,true);
      signal.addEventListener('abort',abort,{once:true});
      child.stdout.setEncoding('utf8');
      child.stdout.on('data',(chunk:string)=>{
        if(settled)return;
        buffer+=chunk;
        let end:number;
        while((end=buffer.indexOf('\0'))>=0){
          const file=buffer.slice(0,end);buffer=buffer.slice(end+1);
          if(path.isAbsolute(file))paths.add(file);
          if(paths.size>200){finish(undefined,true);return;}
        }
        if(buffer.length>1024*1024)finish(new Error('Spotlight 返回路径过长'),true);
      });
      child.stderr.resume();
      child.on('error',error=>finish(error,true));
      child.on('close',code=>finish(code===0?undefined:new Error('Spotlight 进程退出失败')));
    });
  }
  forget(owner:number){this.pending.get(owner)?.abort();this.pending.delete(owner);}
  reset(){for(const owner of this.pending.keys())this.forget(owner);}
}
