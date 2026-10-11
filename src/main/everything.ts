import { app, clipboard, shell } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { everythingArguments, parseEverythingResults, type FileSearchResult } from '../shared/everything';
import { EverythingEngine } from './everything-engine';

const exec=promisify(execFile);
export class EverythingSearch {
  private generations=new Map<number,number>();
  private allowed=new Map<number,Set<string>>();
  private engine:EverythingEngine;
  constructor(paths:()=>string[]){this.engine=new EverythingEngine(paths);}
  async search(owner:number,query:string):Promise<FileSearchResult>{
    const generation=(this.generations.get(owner)||0)+1;this.generations.set(owner,generation);this.allowed.set(owner,new Set());
    if(process.platform!=='win32')return {status:'unsupported',message:'Everything 文件搜索目前仅支持 Windows。应用与快捷方式仍可在主搜索框查找。',items:[],limited:false};
    let version:string;
    try{version=await this.engine.ensure();}catch(e){return {status:'unavailable',message:e instanceof Error?e.message:'内置引擎暂时不可用',items:[],limited:false};}
    const info={version,scopes:this.engine.scopes};
    const directory=path.join(app.getPath('userData'),'cache','everything'),file=path.join(directory,randomUUID()+'.json');
    await mkdir(directory,{recursive:true});
    try{
      await exec(this.engine.es,everythingArguments(query.trim()?query:'Nexlet-Index-Ready-Check-No-Results',file,this.engine.instance),{windowsHide:true,timeout:5000,maxBuffer:128*1024,encoding:'utf8'});
      if((await stat(file)).size>2*1024*1024)throw new Error('Everything 返回结果过大');
      const items=parseEverythingResults(await readFile(file,'utf8'));
      if(this.generations.get(owner)===generation)this.allowed.set(owner,new Set(items.map(i=>i.path)));
      return {status:'ready',message:!query.trim()?'输入文件名或 Everything 搜索语法，例如 ext:pdf 项目':items.length?'':'没有找到相关文件',items:query.trim()?items:[],limited:items.length===200,...info};
    }catch(e){
      const failure=String((e as any).stdout||'')+String((e as any).stderr||'');
      if((e as any).killed||/Error 7:|database|timeout|timed out|not loaded/i.test(failure))return {status:'indexing',message:'正在建立文件索引，首次扫描可能需要几分钟。完成后会自动显示搜索结果。',items:[],limited:false,...info};
      throw new Error('文件搜索失败，请点击重新搜索；如持续失败，可调整索引范围后重试');
    }
    finally{await unlink(file).catch(()=>{});}
  }
  async action(owner:number,action:string,file?:string):Promise<boolean>{
    if(action==='download'){await shell.openExternal('https://www.voidtools.com/downloads/');return true;}
    if(typeof file!=='string'||!this.allowed.get(owner)?.has(file))throw new Error('请从当前搜索结果选择文件');
    if(action==='copy'){await clipboard.writeText(file);return true;}
    await stat(file).catch(()=>{throw new Error('文件已移动、删除或无法访问');});
    if(action==='open'){const error=await shell.openPath(file);if(error)throw new Error(error);}
    else if(action==='reveal')shell.showItemInFolder(file);
    else throw new Error('文件操作无效');return true;
  }
  forget(owner:number){this.allowed.delete(owner);this.generations.delete(owner);}
  async reset(){this.allowed.clear();await this.engine.stop();}
  async close(){if(process.platform==='win32')await this.engine.stop(true);}
}
