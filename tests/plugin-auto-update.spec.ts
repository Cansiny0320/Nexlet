import {test,expect,_electron as electron,type ElectronApplication,type Page} from '@playwright/test';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
const root=process.cwd(),id='org.nexlet.auto-update';
let app:ElectronApplication,page:Page,folder:string;
function bundle(version:string,code='open'){
 const zip=new AdmZip();
 zip.addFile('plugin.json',Buffer.from(JSON.stringify({id,name:'自动更新测试',description:'启动时自动更新验证',version,apiVersion:1,main:'index.html',permissions:['secrets'],features:[{code,name:'自动更新测试',keywords:['autoupdate']}]})));
 zip.addFile('index.html',Buffer.from('<html><body><p id="version">'+version+'</p><textarea id="input"></textarea><script src="main.js"></script></body></html>'));
 zip.addFile('main.js',Buffer.from('nexlet.onEnter(context=>{document.querySelector("#input").value=context.payload||"";});'));
 return zip.toBuffer();
}
async function call(action:string,payload?:unknown){return page.evaluate(({action,payload})=>(window as any).nexlet.call(action,payload),{action,payload});}
async function configure(value:Record<string,unknown>){await app.evaluate((_,value)=>Object.assign((globalThis as any).__auto,value),value);}
async function hits(){return app.evaluate(()=>(globalThis as any).__auto.hits as string[]);}
async function record(){return (await call('pluginInspect')).find((p:any)=>p.manifest.id===id);}
async function plugin(){await expect.poll(()=>app.context().pages().some(p=>p.url().startsWith('nexlet-plugin://'+id+'/'))).toBe(true);return app.context().pages().find(p=>p.url().startsWith('nexlet-plugin://'+id+'/'))!;}
async function launch(payload='preserved input'){return call('launch',{id:'plugin:'+id+':open',payload});}
test.beforeEach(async()=>{
 folder=await mkdtemp(path.join(tmpdir(),'nexlet-auto-update-'));
 const env:NodeJS.ProcessEnv={...process.env,NEXLET_TEST_MODE:'1',NEXLET_USER_DATA:folder};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({args:[root],env:env as Record<string,string>});page=await app.firstWindow();await expect(page.locator('.launcher-input')).toBeVisible();
 await app.evaluate(({dialog,safeStorage},args)=>{
  const g=globalThis as any,n=g.__nexlet;
  g.__auto={version:'1.0.0',hits:[],mode:'ok',bundles:args.bundles};
  dialog.showMessageBox=(async()=>{throw Error('自动更新不应弹确认');}) as any;
  safeStorage.isEncryptionAvailable=()=>true;safeStorage.encryptString=(text:string)=>Buffer.from(text);safeStorage.decryptString=(value:Buffer)=>value.toString();
  n.marketplace.download=async(url:string,_max:number,options?:{timeoutMs?:number;signal?:AbortSignal})=>{
   const a=g.__auto;a.hits.push(url.endsWith('index.json')?'index':'bundle');
   if(a.mode==='offline')throw Error('offline');
   if(url.endsWith('index.json'))return Buffer.from(JSON.stringify({schemaVersion:1,plugins:[{id:args.id,name:'自动更新测试',description:'fixture',author:'Nexlet',category:'test',version:a.version,platforms:['win32','darwin','linux'],minHostVersion:a.minHost||'0.2.7',download:`https://github.com/Cansiny0320/Nexlet-plugins/releases/download/v${a.version}/test.nexlet`}]}));
   if(a.mode==='slow')await new Promise<void>(resolve=>{a.resolve=resolve;options?.signal?.addEventListener('abort',()=>resolve(),{once:true});});
   if(a.mode==='corrupt')return Buffer.from('bad zip');
   return Buffer.from(a.bundles[a.version],'base64');
  };
 },{id,bundles:{'1.0.0':bundle('1.0.0').toString('base64'),'1.1.0':bundle('1.1.0').toString('base64')}});
 await call('marketInstall',id);await configure({version:'1.1.0',hits:[]});
});
test.afterEach(async()=>{await app?.close();});

test('首次打开刷新旧索引，重复打开只更新一次并保留数据和输入',async()=>{
 await app.evaluate((_,id)=>{const n=(globalThis as any).__nexlet;n.store.set('plugin-data:'+id,{setting:'keep'});n.plugins.secrets.set(id,0,'apiKey','fixture-key');},id);
 await Promise.all([launch(),launch()]);const view=await plugin();await expect(view.locator('#version')).toHaveText('1.1.0');await expect(view.locator('#input')).toHaveValue('preserved input');
 expect(await hits()).toEqual(['index','bundle']);expect((await record()).source).toBe('marketplace');
 expect(await view.evaluate(()=>(window as any).nexlet.storage.get('setting'))).toBe('keep');expect(await view.evaluate(()=>(window as any).nexlet.secrets.get('apiKey'))).toBe('fixture-key');
});

test('已有分离会话只聚焦，关闭后重新打开才自动更新',async()=>{
 await configure({version:'1.0.0'});await launch();const old=await plugin();await old.locator('#input').fill('unsaved text');
 const detachedPromise=app.waitForEvent('window');await call('window',{action:'detach',view:'plugin'});const detached=await detachedPromise;await expect(detached.locator('.plugin-pill')).toBeVisible();
 await configure({version:'1.1.0',hits:[]});await call('launch',{id:'plugin:'+id+':open',mode:'open'});await expect(old.locator('#input')).toHaveValue('unsaved text');expect(await hits()).toEqual([]);expect((await record()).manifest.version).toBe('1.0.0');
 await detached.close();await launch('next open');await expect((await plugin()).locator('#version')).toHaveText('1.1.0');await expect((await plugin()).locator('#input')).toHaveValue('next open');expect(await hits()).toEqual(['index','bundle']);
});

for(const mode of ['offline','corrupt'])test(mode+' 时继续使用旧版',async()=>{
 await configure({mode});await launch();await expect((await plugin()).locator('#version')).toHaveText('1.0.0');await expect((await plugin()).locator('#input')).toHaveValue('preserved input');expect((await record()).manifest.version).toBe('1.0.0');
});

test('本地导入与开发目录不自动覆盖',async()=>{
 const file=path.join(folder,'local.nexlet');await writeFile(file,bundle('1.0.0'));
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=(async()=>({canceled:false,filePaths:[file]})) as any;},file);await call('pluginInstall',{development:false});await launch();expect(await hits()).toEqual([]);await expect((await plugin()).locator('#version')).toHaveText('1.0.0');
 await call('window',{action:'exitPlugin'});await app.evaluate((_,id)=>{const n=(globalThis as any).__nexlet;const records=n.plugins.records();records.find((r:any)=>r.manifest.id===id).development=true;n.store.set('plugins',records);},id);await launch();expect(await hits()).toEqual([]);
});

test('不兼容宿主或移除了当前功能的新版不会替换旧版',async()=>{
 await configure({minHost:'999.0.0'});await launch();expect(await hits()).toEqual(['index']);expect((await record()).manifest.version).toBe('1.0.0');
 await call('window',{action:'exitPlugin'});await configure({minHost:'0.2.7',hits:[],bundles:{'1.1.0':bundle('1.1.0','removed').toString('base64')}});await launch();await expect((await plugin()).locator('#version')).toHaveText('1.0.0');expect((await record()).manifest.version).toBe('1.0.0');
});

for(const action of ['exit','disable','remove'])test('下载期间 '+action+' 不会晚到更新或复活',async()=>{
 await configure({mode:'slow'});const opening=launch().catch(e=>String(e));await expect.poll(()=>hits()).toEqual(['index','bundle']);
 if(action==='exit')await call('window',{action:'exitPlugin'});else if(action==='disable')await call('pluginToggle',{id,enabled:false});else await call('pluginRemove',{id,deleteData:true});
 await app.evaluate(()=>{(globalThis as any).__auto.resolve?.();});await opening;
 expect(app.context().pages().some(p=>p.url().startsWith('nexlet-plugin://'+id+'/'))).toBe(false);
 const current=await record();if(action==='remove')expect(current).toBeUndefined();else{expect(current.manifest.version).toBe('1.0.0');expect(current.enabled).toBe(action!=='disable');}
});
