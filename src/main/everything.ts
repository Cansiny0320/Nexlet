import { app, clipboard, shell } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { everythingArguments, parseEverythingResults, type FileSearchResult, type FileSearchIndexStatus } from '../shared/everything';
import { EverythingEngine } from './everything-engine';
import { SpotlightSearch } from './spotlight';
import { FileBrowser } from './file-browser';

const exec=promisify(execFile);
export class EverythingSearch {
  private generations=new Map<number,number>();
  private allowed=new Map<number,Set<string>>();
  private browser=new FileBrowser(owner=>this.allowed.get(owner));
  private engine:EverythingEngine;
  private spotlight:SpotlightSearch;
  private nextGeneration=0;
  private preparation:Promise<FileSearchIndexStatus>|null=null;
  private preparationSince=0;
  constructor(paths:()=>string[],private platform:NodeJS.Platform=process.platform){this.engine=new EverythingEngine(paths);this.spotlight=new SpotlightSearch(paths);}
  async status():Promise<FileSearchIndexStatus>{
    if(this.preparation)return this.preparation;
    this.preparation=this.checkStatus();
    try{return await this.preparation;}finally{this.preparation=null;}
  }
  private async checkStatus():Promise<FileSearchIndexStatus>{
    const startedAt=this.preparationSince||=Date.now();
    if(this.platform!=='win32')return {status:'unsupported',message:'当前平台无需启动 Everything。',startedAt};
    let version:string;
    try{version=await this.engine.ensure();}catch(e){return {status:'unavailable',message:e instanceof Error?e.message:'内置引擎暂时不可用',startedAt};}
    const info={startedAt,version,scopes:this.engine.scopes};
    try{
      // This readiness probe exports no files and never touches result grants.
      await exec(this.engine.es,['-argv','-instance',this.engine.instance,'-timeout','1500','-n','0','--'],{windowsHide:true,timeout:5000,maxBuffer:4096,encoding:'utf8'});
      this.preparationSince=0;
      return {status:'ready',message:'索引已就绪',...info};
    }catch(e){
      const failure=String((e as any).stdout||'')+String((e as any).stderr||'');
      if((e as any).killed||[7,8].includes((e as any).code)||/Error [78]:|database|timeout|timed out|not loaded/i.test(failure)){
        if(this.engine.running||await this.engine.version())return {status:'preparing',message:'正在准备文件索引，首次扫描可能需要几分钟。',...info};
        return {status:'unavailable',message:'内置搜索引擎连接已中断，请点击重试重新连接。',...info};
      }
      return {status:'unavailable',message:'无法检查文件索引，请稍后重试。',...info};
    }
  }
  async search(owner:number,query:string):Promise<FileSearchResult>{
    this.browser.forget(owner);
    const generation=++this.nextGeneration;this.generations.set(owner,generation);this.allowed.set(owner,new Set());
    if(this.platform==='darwin'){
      const result=await this.spotlight.search(owner,query);
      if(this.generations.get(owner)===generation)this.allowed.set(owner,new Set(result.items.map(item=>item.path)));
      return result;
    }
    if(this.platform!=='win32')return {status:'unsupported',message:'文件搜索目前支持 Windows 和 macOS。应用与快捷方式仍可在主搜索框查找。',items:[],limited:false};
    if(!query.trim())return {status:'idle',message:'输入文件名或路径开始搜索，例如 ext:pdf 项目',items:[],limited:false};
    let version:string;
    try{version=await this.engine.ensure();}catch(e){return {status:'unavailable',message:e instanceof Error?e.message:'内置引擎暂时不可用',items:[],limited:false};}
    const info={version,scopes:this.engine.scopes};
    const directory=path.join(app.getPath('userData'),'cache','everything'),file=path.join(directory,randomUUID()+'.json');
    await mkdir(directory,{recursive:true});
    try{
      await exec(this.engine.es,everythingArguments(query,file,this.engine.instance),{windowsHide:true,timeout:5000,maxBuffer:128*1024,encoding:'utf8'});
      if((await stat(file)).size>2*1024*1024)throw new Error('Everything 返回结果过大');
      const items=parseEverythingResults(await readFile(file,'utf8'));
      if(this.generations.get(owner)===generation)this.allowed.set(owner,new Set(items.map(i=>i.path)));
      return {status:'ready',message:items.length?'':'没有找到相关文件',items,limited:items.length===200,...info};
    }catch(e){
      const failure=String((e as any).stdout||'')+String((e as any).stderr||'');
      // ES 1.1 also reports Error 8 when an existing instance's database is
      // still loading at -timeout. Check that same instance before classifying it.
      if((e as any).code===8||/Error 8:/i.test(failure)){
        if(this.engine.running||await this.engine.version())return {status:'indexing',message:'正在准备文件索引，首次扫描可能需要几分钟。完成后会自动显示搜索结果。',items:[],limited:false,...info};
        return {status:'unavailable',message:'内置搜索引擎连接已中断，请点击重试重新连接。',items:[],limited:false,...info};
      }
      if((e as any).killed||(e as any).code===7||/Error 7:|database|timeout|timed out|not loaded/i.test(failure))return {status:'indexing',message:'搜索引擎正在准备或响应较慢，稍后会自动重试。',items:[],limited:false,...info};
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
  browse(owner:number,file:string,filter?:string,cursor?:string){return this.browser.browse(owner,file,filter,cursor);}
  info(owner:number,file:string){return this.browser.info(owner,file);}
  forget(owner:number){this.browser.forget(owner);this.spotlight.forget(owner);this.allowed.delete(owner);this.generations.delete(owner);}
  async reset(){this.browser.reset();this.generations.clear();this.allowed.clear();this.spotlight.reset();await this.preparation?.catch(()=>{});this.preparationSince=0;if(this.platform==='win32')await this.engine.stop();}
  async close(){this.browser.reset();this.generations.clear();this.allowed.clear();this.spotlight.reset();await this.preparation?.catch(()=>{});if(this.platform==='win32')await this.engine.stop(true);}
}
