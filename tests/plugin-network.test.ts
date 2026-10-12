import {describe,it,expect,vi} from 'vitest';
import {PluginNetwork,validateNetworkRequest} from '../src/main/plugin-network';
const request={id:'one',url:'https://translate.googleapis.com/translate_a/single'};
describe('plugin network boundary',()=>{
 it('accepts HTTPS and explicit loopback HTTP only',()=>{
  for(const url of ['https://api.example.com/v1/chat/completions','http://127.0.0.1:1234/v1','http://localhost:11434/v1','http://[::1]:8080/'])expect(validateNetworkRequest({...request,url}).url).toBe(url);
  for(const url of ['http://example.com','file:///etc/passwd','https://a:b@example.com','http://localhost.evil.test','http://192.168.1.1/'])expect(()=>validateNetworkRequest({...request,url})).toThrow();
 });
 it('rejects unsafe headers, methods, oversized body and request IDs',()=>{
  for(const patch of [{headers:{Cookie:'a=b'}},{headers:{Host:'evil.test'}},{headers:{Authorization:'a\nb'}},{method:'CONNECT'},{body:'a'.repeat(256*1024+1),method:'POST'},{id:'../bad'},{body:'a'}])expect(()=>validateNetworkRequest({...request,...patch})).toThrow();
 });
 it('does not fetch before origin authorization; denial sends nothing',async()=>{
  const fetcher=vi.fn();const network=new PluginNetwork(fetcher);
  await expect(network.request(1,request,async()=>{throw Error('用户取消联网授权');})).rejects.toThrow('取消');expect(fetcher).not.toHaveBeenCalled();
 });
 it('omits credentials, blocks redirects and exposes bounded response',async()=>{
  const fetcher=vi.fn(async(_url:string,_init:RequestInit)=>new Response('{"ok":true}',{status:200}));const network=new PluginNetwork(fetcher);
  const grant=vi.fn(async()=>{});expect(await network.request(1,request,grant)).toEqual({status:200,body:'{"ok":true}'});
  expect(grant).toHaveBeenCalledWith('https://translate.googleapis.com');expect(fetcher.mock.calls[0][1]).toMatchObject({credentials:'omit',redirect:'error'});
 });
 it('cancels pending authorization and isolates request IDs by session',async()=>{
  const fetcher=vi.fn(async()=>new Response('ok'));const network=new PluginNetwork(fetcher);
  let approve!:()=>void;const pending=network.request(1,request,()=>new Promise<void>(r=>approve=r));
  await expect(network.request(1,request,async()=>{})).rejects.toThrow('重复');
  expect(network.cancel(2,'one')).toBe(false);expect(network.cancel(1,'one')).toBe(true);approve();await expect(pending).rejects.toThrow('取消');expect(fetcher).not.toHaveBeenCalled();
  expect(await network.request(2,request,async()=>{})).toMatchObject({body:'ok'});
 });
 it('aborts requests on close and enforces timeout',async()=>{
  const fetcher=vi.fn((_url:string,init:RequestInit)=>new Promise<Response>((_resolve,reject)=>init.signal!.addEventListener('abort',()=>reject(init.signal!.reason),{once:true})));
  const network=new PluginNetwork(fetcher);const pending=network.request(1,request,async()=>{});await Promise.resolve();network.close(1);await expect(pending).rejects.toThrow('取消');
  await expect(network.request(2,{...request,timeoutMs:10},async()=>{})).rejects.toThrow('超时');
 });
 it('limits response bytes while streaming and concurrent calls',async()=>{
  const network=new PluginNetwork(async()=>new Response('x'.repeat(2*1024*1024+1)));
  await expect(network.request(1,request,async()=>{})).rejects.toThrow('响应');
  const waiting=Array.from({length:4},(_,i)=>network.request(2,{...request,id:String(i)},()=>new Promise(()=>{})).catch(e=>e.message));
  await expect(network.request(2,{...request,id:'fifth'},async()=>{})).rejects.toThrow('并发');network.close(2);await Promise.all(waiting);
 });
});
