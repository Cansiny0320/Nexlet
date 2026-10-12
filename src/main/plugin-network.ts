const MAX_REQUEST = 256 * 1024;
const MAX_RESPONSE = 2 * 1024 * 1024;
export interface NetworkRequest { id:string; url:string; method:'GET'|'POST'; headers:Record<string,string>; body?:string; timeoutMs:number; }

export function validateNetworkRequest(value:unknown):NetworkRequest {
  if(!value || typeof value!=='object')throw new Error('网络请求无效');
  const v=value as Record<string,unknown>;
  if(typeof v.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(v.id))throw new Error('请求 ID 无效');
  if(typeof v.url!=='string'||v.url.length>65536)throw new Error('请求地址无效');
  const url=new URL(v.url);
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))||url.username||url.password||url.hash)throw new Error('仅允许 HTTPS 或本机 HTTP 地址，不能包含账号或片段');
  const method=v.method??'GET';if(method!=='GET'&&method!=='POST')throw new Error('仅支持 GET / POST');
  const headers:Record<string,string>={};
  if(v.headers!==undefined){
    if(!v.headers||typeof v.headers!=='object'||Array.isArray(v.headers))throw new Error('请求头无效');
    for(const [name,value] of Object.entries(v.headers)){
      const lower=name.toLowerCase();
      if(!['accept','content-type','authorization','x-api-key'].includes(lower)||typeof value!=='string'||value.length>16384||/[\r\n\0]/.test(value))throw new Error('请求头不受支持');
      headers[lower]=value;
    }
  }
  if(v.body!==undefined&&(method!=='POST'||typeof v.body!=='string'||Buffer.byteLength(v.body)>MAX_REQUEST))throw new Error('请求正文无效或超过 256 KB');
  const timeoutMs=v.timeoutMs??30000;
  if(typeof timeoutMs!=='number'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw new Error('请求超时必须为 1–120000 ms');
  return {id:v.id,url:url.href,method,headers,...(v.body===undefined?{}:{body:v.body as string}),timeoutMs};
}

/** All requests belong to a live renderer; permissions and origin consent are checked by the caller. */
export class PluginNetwork {
  private pending=new Map<number,Map<string,AbortController>>();
  constructor(private fetcher:(url:string,init:RequestInit)=>Promise<Response>){}
  async request(session:number,value:unknown,authorize:(origin:string)=>Promise<void>):Promise<{status:number;body:string}>{
    const request=validateNetworkRequest(value);
    let requests=this.pending.get(session);if(!requests){requests=new Map();this.pending.set(session,requests);}
    if(requests.has(request.id))throw new Error('请求 ID 重复');
    if(requests.size>=4)throw new Error('插件并发请求不能超过 4 个');
    const controller=new AbortController();requests.set(request.id,controller);
    let timer:ReturnType<typeof setTimeout>|undefined;
    let onAbort!:()=>void;
    const aborted=new Promise<never>((_resolve,reject)=>{onAbort=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',onAbort,{once:true});});
    const run=async()=>{
      await authorize(new URL(request.url).origin);controller.signal.throwIfAborted();
      timer=setTimeout(()=>controller.abort(new Error('请求超时，请稍后重试')),request.timeoutMs);
      let response:Response;
      try{response=await this.fetcher(request.url,{method:request.method,headers:request.headers,body:request.body,signal:controller.signal,credentials:'omit',redirect:'error'});}
      catch{controller.signal.throwIfAborted();throw new Error('网络连接失败，请检查网络或服务地址（不支持重定向）');}
      controller.signal.throwIfAborted();
      const reader=response.body?.getReader();
      if(Number(response.headers.get('content-length'))>MAX_RESPONSE){await reader?.cancel();throw new Error('响应超过 2 MB');}
      const chunks:Uint8Array[]=[];let total=0;
      try{
        if(reader)for(;;){const {done,value}=await reader.read();controller.signal.throwIfAborted();if(done)break;total+=value.byteLength;if(total>MAX_RESPONSE)throw new Error('响应超过 2 MB');chunks.push(value);}
      }catch(error){await reader?.cancel().catch(()=>{});throw error;}finally{reader?.releaseLock();}
      return {status:response.status,body:Buffer.concat(chunks).toString('utf8')};
    };
    try{return await Promise.race([run(),aborted]);}
    finally{clearTimeout(timer);controller.signal.removeEventListener('abort',onAbort);requests.delete(request.id);if(!requests.size&&this.pending.get(session)===requests)this.pending.delete(session);}
  }
  cancel(session:number,id:unknown){if(typeof id!=='string')throw new Error('请求 ID 无效');const controller=this.pending.get(session)?.get(id);controller?.abort(new Error('请求已取消'));return !!controller;}
  close(session:number){for(const controller of this.pending.get(session)?.values()??[])controller.abort(new Error('请求已取消'));this.pending.delete(session);}
}
