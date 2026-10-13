import { app, net, type BrowserWindow } from 'electron';
import type { Store } from './store';
import type { PluginManager } from './plugins';
import { readPluginZip, type PluginBundle } from './plugin-bundle';
import type { PluginRecord } from '../shared/types';
import { MARKET_INDEX_URL, validateMarketIndex, marketAvailability, type MarketState, type MarketIndex } from '../shared/marketplace';

interface DownloadOptions { timeoutMs?:number; signal?:AbortSignal; }
export function downloadBounded(url:string,max:number,{timeoutMs=25000,signal}:DownloadOptions={}):Promise<Buffer>{
  if(signal?.aborted)return Promise.reject(new Error('插件启动已取消'));
  return new Promise((resolve,reject)=>{
    const request=net.request({url,method:'GET',redirect:'manual',credentials:'omit'});let settled=false,redirects=0;
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);};
    const fail=(error:Error)=>{if(settled)return;settled=true;cleanup();reject(error);request.abort();};
    const cancel=()=>fail(new Error('插件启动已取消'));
    const timer=setTimeout(()=>fail(new Error('连接插件市场超时，请稍后重试')),timeoutMs);
    signal?.addEventListener('abort',cancel,{once:true});
    request.on('error',error=>fail(error));
    request.on('redirect',(_status,_method,target)=>{
      try{const next=new URL(target);if(++redirects>3||next.protocol!=='https:'||next.username||next.password||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(next.hostname))throw new Error('下载重定向地址不受支持');request.followRedirect();}catch(e){fail(e instanceof Error?e:new Error('下载跳转失败'));}
    });
    request.on('response',response=>{
      if(settled)return;
      if(response.statusCode!==200){fail(new Error(`下载失败（HTTP ${response.statusCode}）`));return;}
      if(Number(response.headers['content-length'])>max){fail(new Error('下载文件超过大小限制'));return;}
      const chunks:Buffer[]=[];let total=0;
      response.on('data',chunk=>{if(settled)return;total+=chunk.length;if(total>max){fail(new Error('下载文件超过大小限制'));return;}chunks.push(Buffer.from(chunk));});
      response.on('error',error=>fail(error));response.on('aborted',()=>fail(new Error('下载连接中断，请重试')));
      response.on('end',()=>{if(settled)return;settled=true;cleanup();resolve(Buffer.concat(chunks));});
    });
    request.end();
  });
}
export class Marketplace {
  private pending = false;
  constructor(private store:Store,private plugins:PluginManager,private download=downloadBounded){}
  async prepareUpdate(record:PluginRecord,code:string,signal:AbortSignal):Promise<PluginBundle|null>{
    if(this.pending||record.source!=='marketplace'||record.development||!record.enabled||signal.aborted)return null;
    this.pending=true;
    try{
      const bytes=await this.download(MARKET_INDEX_URL,1024*1024,{timeoutMs:2000,signal});
      if(signal.aborted)return null;
      const index=validateMarketIndex(JSON.parse(bytes.toString('utf8')));
      this.store.set('market-index',{index,fetchedAt:Date.now()});
      const entry=index.plugins.find(e=>e.id===record.manifest.id);
      if(!entry||marketAvailability(entry,process.platform,app.getVersion(),{development:false,version:record.manifest.version}))return null;
      const bundle=readPluginZip(await this.download(entry.download,25*1024*1024,{timeoutMs:10000,signal}));
      if(signal.aborted||bundle.manifest.id!==entry.id||bundle.manifest.version!==entry.version||!bundle.manifest.features.some(f=>f.code===code))return null;
      return bundle;
    }catch{return null;}finally{this.pending=false;}
  }
  async list(refresh=false):Promise<MarketState>{
    const cached=this.store.get<{index:MarketIndex;fetchedAt:number}|null>('market-index',null);
    if(cached&&!refresh)return {entries:validateMarketIndex(cached.index).plugins,fetchedAt:cached.fetchedAt,cached:true,error:null};
    try{const bytes=await this.download(MARKET_INDEX_URL,1024*1024),index=validateMarketIndex(JSON.parse(bytes.toString('utf8'))),fetchedAt=Date.now();this.store.set('market-index',{index,fetchedAt});return {entries:index.plugins,fetchedAt,cached:false,error:null};}
    catch(e){return {entries:cached?validateMarketIndex(cached.index).plugins:[],fetchedAt:cached?.fetchedAt||null,cached:!!cached,error:e instanceof Error?e.message:'无法加载插件市场'};}
  }
  async install(owner:BrowserWindow,id:string):Promise<boolean>{
    if(this.pending)throw new Error('请等待当前插件安装完成');this.pending=true;
    try{
      const index=await this.list(),entry=index.entries.find(e=>e.id===id);if(!entry)throw new Error('插件条目不存在，请刷新市场');
      const existing=this.plugins.records().find(p=>p.manifest.id===id);
      const unavailable=marketAvailability(entry,process.platform,app.getVersion(),existing?{development:existing.development,version:existing.manifest.version}:undefined);if(unavailable)throw new Error(unavailable);
      const bundle=readPluginZip(await this.download(entry.download,25*1024*1024));
      if(bundle.manifest.id!==id||bundle.manifest.version!==entry.version)throw new Error('插件包的 ID 或版本与市场条目不一致');
      return this.plugins.installBundle(owner,bundle,{source:'marketplace'});
    } finally {this.pending=false;}
  }
}
