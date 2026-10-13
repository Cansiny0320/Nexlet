import {test,expect,_electron as electron,type ElectronApplication,type Page} from '@playwright/test';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
let app:ElectronApplication,page:Page,folder:string;
const errors:string[]=[];
async function call(action:string,payload?:unknown,target=page){return target.evaluate(({action,payload})=>(window as any).nexlet.call(action,payload),{action,payload});}
async function home(){await call('window',{action:'exitPlugin'});await app.evaluate(()=>{const n=(globalThis as any).__nexlet;n.main.show();n.main.webContents.send('host-change','navigate:launcher');});await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();}
async function open(name:string){await home();await page.getByLabel('搜索功能、应用或快捷方式').fill(name);await page.getByRole('button',{name,exact:true}).first().click();}
async function pluginJS(script:string){return app.evaluate(async(_,script)=>{const active=(globalThis as any).__nexlet.plugins.runtime.sessions.get('org.nexlet.fixture');await active.queue;return active.view.webContents.executeJavaScript(script);},script);}
async function closePopup(target:Page){
 const closed=target.waitForEvent('close');
 await target.getByRole('button',{name:'关闭窗口',exact:true}).click().catch(error=>{
  if(!target.isClosed()||!String(error).includes('Target page, context or browser has been closed'))throw error;
 });
 await closed;
}
async function detach(){const popup=app.waitForEvent('window');await page.getByRole('button',{name:'分离为独立窗口',exact:true}).click();const target=await popup;await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();return target;}
test.beforeAll(async()=>{
 folder=await mkdtemp(path.join(tmpdir(),'nexlet-alignment-'));const fixture=path.join(folder,'plugin');await mkdir(fixture);
 await writeFile(path.join(fixture,'plugin.json'),JSON.stringify({id:'org.nexlet.fixture',name:'会话验证',version:'1.0.0',apiVersion:1,description:'隔离测试',main:'index.html',permissions:[],features:[{code:'one',name:'输入验证',keywords:['fixture'],matches:[{type:'text',minLength:3},{type:'files',extensions:['txt']},{type:'image'}]},{code:'two',name:'第二功能',keywords:['second']}]}));
 await writeFile(path.join(fixture,'index.html'),'<html><body><input id="draft"><script src="app.js"></script></body></html>');
 await writeFile(path.join(fixture,'app.js'),`window.events=[];nexlet.onReady(()=>events.push('ready'));nexlet.onEnter(v=>{events.push('enter:'+v.code);window.context=v;});nexlet.onDetach(()=>events.push('detach'));nexlet.onOut(()=>nexlet.storage.set('out',true));nexlet.onActivate(v=>events.push('activate:'+v.code));`);
 const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),NEXLET_TEST_MODE:'1',NEXLET_USER_DATA:path.join(folder,'data')};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({args:[process.cwd()],env});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
 await app.evaluate(({dialog},fixture)=>{dialog.showOpenDialog=(async()=>({canceled:false,filePaths:[fixture]})) as any;dialog.showMessageBox=(async()=>({response:1})) as any;},fixture);await call('pluginInstall',{development:true});
});
test.afterAll(async()=>{await app?.close();});
test('结构化输入不写剪贴板；内嵌会话的生命周期、资源与同实例分离',async()=>{
 const file=path.join(folder,'sample.txt');await writeFile(file,'resource bytes');
 const before=await app.evaluate(async({clipboard})=>await clipboard.readText());
 const input:any=await call('launchInput',{type:'files',paths:[file],from:'drop'});
 const result:any=await call('search',{query:'',inputId:input.id});expect(result.matches.some((c:any)=>c.id==='plugin:org.nexlet.fixture:one')).toBe(true);
 expect(await app.evaluate(async({clipboard})=>await clipboard.readText())).toBe(before);
 await call('launch',{id:'plugin:org.nexlet.fixture:one',inputId:input.id});await expect(page.locator('.plugin-pill')).toContainText('会话验证');
 expect(await pluginJS('events')).toEqual(['ready','enter:one']);expect(await pluginJS('({node:typeof require,process:typeof process})')).toEqual({node:'undefined',process:'undefined'});
 expect(await pluginJS("fetch('https://example.com').then(()=>false,()=>true)")).toBe(true);
 expect(await pluginJS("nexlet.clipboard.readText().then(()=>'',e=>String(e))")).toContain('未授权');
 expect(await pluginJS('nexlet.input.read(context.payload[0].id).then(b=>new TextDecoder().decode(b))')).toBe('resource bytes');
 await pluginJS("window.oldToken=context.payload[0].id;document.querySelector('#draft').value='保留内容'");
 const id=await app.evaluate(()=>(globalThis as any).__nexlet.plugins.runtime.sessions.get('org.nexlet.fixture').view.webContents.id);
 await call('window',{action:'hide'});expect(await pluginJS("document.querySelector('#draft').value")).toBe('保留内容');
 await call('launch',{id:'plugin:org.nexlet.fixture:two',payload:'second payload'});expect(await pluginJS('events')).toEqual(['ready','enter:one','activate:two','enter:two']);
 expect(await pluginJS('nexlet.input.read(oldToken).then(()=>false,()=>true)')).toBe(true);
 const popup=await detach();expect(await pluginJS("document.querySelector('#draft').value")).toBe('保留内容');expect(await pluginJS('events')).toEqual(['ready','enter:one','activate:two','enter:two','detach']);
 expect(await app.evaluate(()=>(globalThis as any).__nexlet.plugins.runtime.sessions.get('org.nexlet.fixture').view.webContents.id)).toBe(id);
 await closePopup(popup);await expect.poll(()=>app.evaluate(()=>(globalThis as any).__nexlet.plugins.runtime.sessions.size)).toBe(0);
 expect(await app.evaluate(()=>(globalThis as any).__nexlet.store.get('plugin-data:org.nexlet.fixture',{}).out)).toBe(true);
 await expect(call('launch',{id:'plugin:org.nexlet.fixture:one',inputId:input.id})).rejects.toThrow();
});
test('禁用与崩溃释放会话，重新打开创建可用实例',async()=>{
 await call('launch',{id:'plugin:org.nexlet.fixture:one'});await call('pluginToggle',{id:'org.nexlet.fixture',enabled:false});expect(await app.evaluate(()=>(globalThis as any).__nexlet.plugins.runtime.sessions.size)).toBe(0);
 await call('pluginToggle',{id:'org.nexlet.fixture',enabled:true});await call('launch',{id:'plugin:org.nexlet.fixture:one'});
 await app.evaluate(()=>(globalThis as any).__nexlet.plugins.runtime.sessions.get('org.nexlet.fixture').view.webContents.forcefullyCrashRenderer());await expect.poll(()=>app.evaluate(()=>(globalThis as any).__nexlet.plugins.runtime.sessions.size)).toBe(0);
 await call('launch',{id:'plugin:org.nexlet.fixture:one'});expect(await pluginJS('events')).toEqual(['ready','enter:one']);await home();
});
test('JSON 双栏和对比结果随分离保留',async()=>{
 await open('JSON 工具');await page.getByRole('tab',{name:'JSON 对比',exact:true}).click();await page.getByRole('textbox',{name:'原始 JSON',exact:true}).fill('{"old":1}');await page.getByRole('textbox',{name:'修改后的 JSON',exact:true}).fill('{"new":2}');await page.getByRole('button',{name:'开始对比'}).click();
 const popup=await detach();await expect(popup.getByRole('tab',{name:'JSON 对比',exact:true})).toHaveAttribute('aria-selected','true');await expect(popup.getByLabel('原始 JSON 差异')).toContainText('old');await expect(popup.locator('.cm-deletedLine').first()).toBeVisible();await closePopup(popup);
});
test('编码输入输出、UUID 和时间戳随分离保留',async()=>{
 await open('编码转换');await page.getByLabel('工具输入').fill('未保存的输入');await page.getByRole('button',{name:'编码',exact:true}).click();await expect(page.getByLabel('工具结果')).not.toHaveValue('');const output=await page.getByLabel('工具结果').inputValue();let popup=await detach();await expect(popup.getByLabel('工具输入')).toHaveValue('未保存的输入');await expect(popup.getByLabel('工具结果')).toHaveValue(output);await closePopup(popup);
 await open('UUID');await expect(page.getByLabel('生成的 UUID')).toHaveValue(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);const uuid=await page.getByLabel('生成的 UUID').inputValue();popup=await detach();await expect(popup.getByLabel('生成的 UUID')).toHaveValue(uuid);await closePopup(popup);
 await open('时间戳');await page.getByLabel('Unix 时间戳').fill('12345');popup=await detach();await expect(popup.getByLabel('Unix 时间戳')).toHaveValue('12345');await closePopup(popup);
});
test('稿纸未保存内容在分离前落盘，保存失败保留源视图',async()=>{
 await open('计算稿纸');await page.getByRole('button',{name:'新稿纸',exact:true}).click();await page.getByLabel('第 1 行计算公式').fill('321+123');const popup=await detach();await expect(popup.getByLabel('第 1 行计算公式')).toHaveValue('321+123');await closePopup(popup);
 await open('计算稿纸');await app.evaluate(()=>{const store=(globalThis as any).__nexlet.store;(globalThis as any).__originalSet=store.set;store.set=function(key:string,...args:any[]){if(key==='pads')throw Error('模拟保存失败');return (globalThis as any).__originalSet.call(this,key,...args);};});
 await page.getByLabel('第 1 行计算公式').fill('456');await page.getByRole('button',{name:'分离为独立窗口',exact:true}).click();await expect(page.locator('.toast')).toContainText('保存');await expect(page.locator('.handoff-overlay')).toHaveCount(0);await expect(page.getByLabel('第 1 行计算公式')).toHaveValue('456');await app.evaluate(()=>{(globalThis as any).__nexlet.store.set=(globalThis as any).__originalSet;});
});
test('剪贴板筛选与文件搜索查询恢复，界面无脚本异常',async()=>{
 await app.evaluate(()=>{const store=(globalThis as any).__nexlet.store;for(let i=0;i<2;i++)store.addClip({id:'fixture-'+i,hash:'fixture-'+i,kind:'text',text:'nexlet selection '+i,createdAt:Date.now()+i,favorite:true});});
 await open('剪贴板');await page.getByLabel('搜索剪贴板').fill('nexlet');await page.getByRole('button',{name:'收藏',exact:true}).click();await page.getByRole('option').filter({hasText:'nexlet selection 0'}).click();const pending=app.waitForEvent('window');await page.getByRole('button',{name:'打开独立剪贴板'}).click();let popup=await pending;await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();await expect(popup.getByLabel('搜索剪贴板')).toHaveValue('nexlet');await expect(popup.getByRole('button',{name:/收藏/}).first()).toHaveClass(/active/);await expect(popup.getByRole('option').filter({hasText:'nexlet selection 0'})).toHaveAttribute('aria-selected','true');await closePopup(popup);
 await app.evaluate(()=>{const files=(globalThis as any).__nexlet.files;(globalThis as any).__search=files.search;(globalThis as any).__fileStatus=files.status;files.status=async()=>({status:'ready',message:'索引已就绪',startedAt:Date.now()});(globalThis as any).__owners=[];files.search=async(owner:number,query:string)=>{(globalThis as any).__owners.push(owner);files.allowed.set(owner,new Set(query?['fixture.txt']:[]));return {status:'ready',message:'',items:query?[{path:'fixture.txt',name:'sample.txt',parent:'fixture',size:1,modified:'',directory:false}]:[],limited:false};};});
 await open('文件搜索');await page.getByLabel(/^(Everything|Spotlight) 文件搜索$/).fill('sample.txt');await expect(page.getByRole('option')).toBeVisible();popup=await detach();await expect(popup.getByLabel(/^(Everything|Spotlight) 文件搜索$/)).toHaveValue('sample.txt');await expect(popup.getByRole('option')).toHaveAttribute('aria-selected','true');expect(await app.evaluate(()=>new Set((globalThis as any).__owners).size)).toBe(2);await expect(call('fileAction',{action:'open',path:'unapproved.txt'},popup)).rejects.toThrow('当前搜索结果');await app.evaluate(()=>{(globalThis as any).__nexlet.files.search=(globalThis as any).__search;(globalThis as any).__nexlet.files.status=(globalThis as any).__fileStatus;});await closePopup(popup);expect(errors).toEqual([]);
});


test('粘贴文本、图片和真实文件拖放保持输入卡片且不改剪贴板',async()=>{
 await home();const before=await app.evaluate(async({clipboard})=>await clipboard.readText());
 await page.getByLabel('搜索功能、应用或快捷方式').focus();await page.evaluate(()=>{const transfer=new DataTransfer();transfer.setData('text/plain','{"pasted":1}');document.querySelector('input')!.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));});
 await page.getByRole('button',{name:'输入验证',exact:true}).click();expect(await pluginJS('context')).toMatchObject({type:'text',payload:'{"pasted":1}',from:'paste'});await home();
 const png=await app.evaluate(({nativeImage})=>nativeImage.createFromBitmap(Buffer.alloc(16,255),{width:2,height:2}).toPNG().toString('base64'));
 await page.evaluate(base64=>{const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],'paste.png',{type:'image/png'}));document.querySelector('input')!.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));},png);
 await expect(page.getByLabel('待处理输入')).toContainText('图片');await page.getByLabel('搜索功能、应用或快捷方式').fill('输入验证');await page.getByRole('button',{name:'输入验证',exact:true}).click();expect(await pluginJS('context.type')).toBe('image');expect(await pluginJS('nexlet.input.read(context.payload.id).then(b=>b.length)')).toBeGreaterThan(0);await home();
 const file=path.join(folder,'drop.txt');await writeFile(file,'drop');const cdp=await app.context().newCDPSession(page);const data={items:[],files:[file],dragOperationsMask:1};await cdp.send('Input.dispatchDragEvent',{type:'dragEnter',x:200,y:100,data});await cdp.send('Input.dispatchDragEvent',{type:'drop',x:200,y:100,data});await cdp.detach();
 await expect(page.getByLabel('待处理输入')).toContainText('drop.txt');await page.getByRole('button',{name:'取消内容输入'}).click();await expect(page.getByLabel('待处理输入')).toHaveCount(0);expect(await app.evaluate(async({clipboard})=>await clipboard.readText())).toBe(before);
});
test('加载中退出不会让旧会话复活',async()=>{
 await home();await app.evaluate(()=>{const runtime=(globalThis as any).__nexlet.plugins.runtime;(globalThis as any).__ready=runtime.ready;runtime.ready=()=>{};});
 const pending=call('launch',{id:'plugin:org.nexlet.fixture:one'}).catch(e=>String(e));await expect.poll(()=>app.evaluate(()=>(globalThis as any).__nexlet.plugins.runtime.sessions.size)).toBe(1);await call('window',{action:'exitPlugin'});expect(await pending).toContain('取消');expect(await app.evaluate(()=>(globalThis as any).__nexlet.plugins.runtime.sessions.size)).toBe(0);await app.evaluate(()=>{(globalThis as any).__nexlet.plugins.runtime.ready=(globalThis as any).__ready;});await call('launch',{id:'plugin:org.nexlet.fixture:one'});expect(await pluginJS('events')).toEqual(['ready','enter:one']);await home();
});


test('目标恢复失败回滚并保持源工具可编辑',async()=>{
 await open('编码转换');await page.getByLabel('工具输入').fill('恢复失败不能丢失');await app.evaluate(()=>{const handoff=(globalThis as any).__nexlet.toolHandoffs;(globalThis as any).__read=handoff.read;handoff.read=function(...args:any[]){const value=(globalThis as any).__read.apply(this,args);if(!(globalThis as any).__failedOnce){(globalThis as any).__failedOnce=true;throw Error('模拟目标恢复失败');}return value;};});
 await page.getByRole('button',{name:'分离为独立窗口',exact:true}).click();await expect(page.locator('.toast')).toContainText('模拟目标恢复失败');await expect(page.locator('.handoff-overlay')).toHaveCount(0);await expect(page.getByLabel('工具输入')).toHaveValue('恢复失败不能丢失');await page.getByLabel('工具输入').fill('仍可编辑');await app.evaluate(()=>{(globalThis as any).__nexlet.toolHandoffs.read=(globalThis as any).__read;});
});

test('明确收录时系统回读失败保留输入，不误报成功',async()=>{
 await home();const file=path.join(folder,'unaccepted.txt');await writeFile(file,'keep input');await app.evaluate(()=>{const p=(globalThis as any).__nexlet.platform;(globalThis as any).__fileMethods=[p.writeFiles,p.readFiles];p.writeFiles=async()=>{};p.readFiles=async()=>[];});
 try{const cdp=await app.context().newCDPSession(page),data={items:[],files:[file],dragOperationsMask:1};await cdp.send('Input.dispatchDragEvent',{type:'dragEnter',x:200,y:100,data});await cdp.send('Input.dispatchDragEvent',{type:'drop',x:200,y:100,data});await cdp.detach();await page.getByRole('button',{name:'收进剪贴板',exact:true}).click();await expect(page.locator('.toast')).toContainText('系统未接受文件剪贴板');await expect(page.getByLabel('待处理输入')).toContainText('unaccepted.txt');}
 finally{await app.evaluate(()=>{const p=(globalThis as any).__nexlet.platform;[p.writeFiles,p.readFiles]=(globalThis as any).__fileMethods;});}
});


test('插件页面加载中退出返回取消，之后仍可重新打开',async()=>{
 await home();
 await app.evaluate(()=>{
  const n=(globalThis as any).__nexlet,prototype=Object.getPrototypeOf(n.main.webContents);
  (globalThis as any).__loadURL=prototype.loadURL;
  prototype.loadURL=function(url:string,...args:any[]){
   if(url.startsWith('nexlet-plugin://org.nexlet.fixture/'))return new Promise((_resolve,reject)=>this.once('destroyed',()=>reject(Error('模拟 loadURL 中止'))));
   return (globalThis as any).__loadURL.call(this,url,...args);
  };
 });
 try{
  const pending=call('launch',{id:'plugin:org.nexlet.fixture:one'}).catch(e=>String(e));
  await expect.poll(()=>app.evaluate(()=>(globalThis as any).__nexlet.plugins.runtime.sessions.size)).toBe(1);
  await call('window',{action:'exitPlugin'});
  expect(await pending).toContain('取消');
  expect(await app.evaluate(()=>(globalThis as any).__nexlet.plugins.runtime.sessions.size)).toBe(0);
 }finally{
  await app.evaluate(()=>{Object.getPrototypeOf((globalThis as any).__nexlet.main.webContents).loadURL=(globalThis as any).__loadURL;});
 }
 await call('launch',{id:'plugin:org.nexlet.fixture:one'});expect(await pluginJS('events')).toEqual(['ready','enter:one']);await home();
});
