import {test,expect,_electron as electron,type ElectronApplication,type Page} from '@playwright/test';
import {readFile,mkdtemp,unlink,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
let app:ElectronApplication,main:Page;
const id='org.nexlet.ocr';
const host=(action:string,payload?:unknown)=>main.evaluate(({action,payload})=>window.nexlet.call(action as any,payload),{action,payload});
const read=(script:string)=>app.evaluate(async(_,script)=>{const active=(globalThis as any).__nexlet.plugins.runtime.sessions.get('org.nexlet.ocr');return active.view.webContents.executeJavaScript(script);},script);
async function launch(file:string,code='recognize'){
 const data='data:image/png;base64,'+(await readFile(path.join('docs/screenshots',file))).toString('base64');
 const input:any=await host('launchInput',{type:'image',from:'paste',data});await host('launch',{id:`plugin:${id}:${code}`,inputId:input.id});
 await expect.poll(()=>read('document.querySelector("#status").textContent')).not.toBe('图片在本机处理');
}
async function done(){await expect.poll(()=>read('document.querySelector("#stop").hidden'),{timeout:60000}).toBe(true);return read('document.querySelector("#result").value');}
test.beforeAll(async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'nexlet-ocr-quality-'));
 const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),NEXLET_TEST_MODE:'1',NEXLET_USER_DATA:folder};delete env.ELECTRON_RUN_AS_NODE;
 const executablePath=process.env.NEXLET_E2E_EXECUTABLE;app=await electron.launch({executablePath,args:executablePath?[]:[process.cwd()],env});main=await app.firstWindow();
 await app.evaluate(async({dialog,clipboard},archive)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[archive]});const n=(globalThis as any).__nexlet;(globalThis as any).savedClipboard=await n.selectionPlatform.snapshot();const original=clipboard.writeText.bind(clipboard);clipboard.writeText=async text=>{await original(text);(globalThis as any).clipboardVersion=n.platform.sequence();};},path.resolve('release/nexlet-ocr.nexlet'));
 await host('pluginInstall',{development:false});
});
test.afterAll(async()=>{if(app){await app.evaluate(async()=>{const g=globalThis as any,n=g.__nexlet;if(g.savedClipboard&&g.clipboardVersion!==undefined&&n.platform.sequence()===g.clipboardVersion)await n.selectionPlatform.restore(g.savedClipboard,g.clipboardVersion);});await app.close();}});
const samples=[
 {file:'settings-dark.png',text:['快捷键与窗口','全局唤起','Alt+Space','切换到其他应用时收起主搜索框，独立窗口保持显示','仅保存在本机；暂停后仍可查看已有记录','500条']},
 {file:'marketplace-live.png',text:['插件市场','字数统计','便笺','Google免Key翻译与可配置的LLM翻译','Windows','macOS','Linux','v1.1.0']},
 {file:'filesearch.png',text:['文件搜索','Nexlet搜索验收.txt','2026-10-1201:12','30B','1个索引目录']},
 {file:'json-diff.png',text:['忽略键顺序','修改后的JSON','autoSave','false','true','clipboard','scratchpad','3处差异']},
];
for(const sample of samples)test(`独立插件真实截图 OCR：${sample.file}`,async()=>{
 await launch(sample.file);const text=await done();expect(await read('document.querySelector("#status").textContent')).toBe('识别完成');const normalized=text.normalize('NFKC').replace(/\s/g,'');for(const part of sample.text)expect(normalized).toContain(part.normalize('NFKC'));
 if(sample.file==='filesearch.png'){await mkdir('.tmp/ocr-plugin-validation',{recursive:true});const image=await app.evaluate(async()=>{const active=(globalThis as any).__nexlet.plugins.runtime.sessions.get('org.nexlet.ocr');return (await active.view.webContents.capturePage()).toPNG().toString('base64');});await writeFile('.tmp/ocr-plugin-validation/plugin.png',Buffer.from(image,'base64'));}
});
test('计算权限仍隔离 Node、宿主、文件、外网和未授权 SDK',async()=>{
 const state=await read(`(async()=>({host:typeof window.desktopTools,node:typeof require,remoteBlocked:await fetch('https://example.invalid/ocr-test').then(()=>false,()=>true),fileBlocked:await fetch('file:///etc/passwd').then(()=>false,()=>true),sdkBlocked:await nexlet.files.read('secret').then(()=>false,()=>true)}))()`);
 expect(state).toEqual({host:'undefined',node:'undefined',remoteBlocked:true,fileBlocked:true,sdkBlocked:true});
 const prefs=await app.evaluate(()=>{const c=(globalThis as any).__nexlet.plugins.runtime.sessions.get('org.nexlet.ocr').view.webContents.getLastWebPreferences();return {sandbox:c.sandbox,nodeIntegration:c.nodeIntegration,contextIsolation:c.contextIsolation};});expect(prefs).toEqual({sandbox:true,nodeIntegration:false,contextIsolation:true});
});
test('取消、剪贴板保护和自动复制',async()=>{
 await launch('filesearch.png','copy');await expect.poll(()=>read('document.querySelector("#progress").value')).toBeGreaterThan(0);
 await app.evaluate(async({clipboard})=>{await clipboard.writeText('new-user-copy');});await done();
 expect(await read('document.querySelector("#status").textContent')).toContain('剪贴板已改变');expect(await app.evaluate(({clipboard})=>clipboard.readText())).toBe('new-user-copy');
 await launch('filesearch.png','copy');await done();expect(await app.evaluate(({clipboard})=>clipboard.readText())).toContain('Nexlet');
 await launch('settings-dark.png');await read('document.querySelector("#stop").click()');await done();expect(await read('document.querySelector("#result").value')).toBe('');expect(await read('document.querySelector("#status").textContent')).toBe('已取消识别');
});
test('编辑、旋转、复制及返回搜索',async()=>{
 await launch('filesearch.png');await done();await read(`document.querySelector('#result').value='编辑后的文字 42';document.querySelector('#result').dispatchEvent(new Event('input'));document.querySelector('#rotate').click()`);
 expect(await read('document.querySelector("#result").value')).toBe('编辑后的文字 42');await read('document.querySelector("#copy").click()');await expect.poll(()=>app.evaluate(({clipboard})=>clipboard.readText())).toBe('编辑后的文字 42');
 await read('document.querySelector("#search").click()');await expect(main.getByLabel('待处理输入')).toContainText('编辑后的文字 42');
});
test('停用关闭识别并拒绝启动，重新启用可用',async()=>{
 await launch('settings-dark.png');await host('pluginToggle',{id,enabled:false});expect(await app.evaluate(()=>(globalThis as any).__nexlet.plugins.runtime.sessions.has('org.nexlet.ocr'))).toBe(false);
 await expect(host('launch',{id:`plugin:${id}:recognize`})).rejects.toThrow();await host('pluginToggle',{id,enabled:true});await launch('filesearch.png');expect(await done()).toContain('Nexlet');
});
test('截图入口取消不改剪贴板，选区识别复制可用',async()=>{
 const image=(await readFile('docs/screenshots/filesearch.png')).toString('base64');
 const bounds=await app.evaluate(({desktopCapturer,nativeImage,screen},image)=>{
  (globalThis as any).originalCapture=desktopCapturer.getSources;
  const display=screen.getPrimaryDisplay();desktopCapturer.getSources=async()=>[{id:'screen:fixture:0',display_id:String(display.id),thumbnail:nativeImage.createFromBuffer(Buffer.from(image,'base64')),name:'Fixture',appIcon:nativeImage.createEmpty()}];return display.bounds;
 },image);
 try{
  await app.evaluate(async({clipboard})=>{await clipboard.writeText('capture-original');});
  let waiting=app.waitForEvent('window');await host('launch',{id:`plugin:${id}:capture`});let overlay=await waiting;
  await expect(overlay.getByText('拖动选择区域 · Esc 取消')).toBeVisible();await overlay.keyboard.press('Escape').catch(error=>{if(!error.message.includes('closed'))throw error;});
  await expect.poll(()=>read('nexlet.window.info().then(x=>x.visible)')).toBe(true);expect(await app.evaluate(({clipboard})=>clipboard.readText())).toBe('capture-original');
  waiting=app.waitForEvent('window');await host('launch',{id:`plugin:${id}:capture-copy`});overlay=await waiting;
  await expect(overlay.getByText('拖动选择区域 · Esc 取消')).toBeVisible();await overlay.mouse.move(1,1);await overlay.mouse.down();await overlay.mouse.move(bounds.width-2,bounds.height-2);await overlay.mouse.up();
  await expect.poll(()=>read('document.querySelector("#status").textContent'),{timeout:60000}).toBe('文字已复制');expect(await app.evaluate(({clipboard})=>clipboard.readText())).toContain('Nexlet');
 }finally{await app.evaluate(({desktopCapturer})=>{desktopCapturer.getSources=(globalThis as any).originalCapture;});}
});
test('替换安装保留偏好，功能禁用同时阻止快捷键启动',async()=>{
 const command=`plugin:${id}:recognize`;
 await host('commandConfig',{action:'patch',id:command,patch:{aliases:['my-ocr'],disabled:true}});
 await host('pluginInstall',{development:false});
 const state:any=await host('state');expect(state.commandConfig.commands[command]).toMatchObject({aliases:['my-ocr'],disabled:true});
 await expect(host('launch',{id:command})).rejects.toThrow('禁用');await expect(app.evaluate((_,id)=>(globalThis as any).__nexlet.activateHotkey(id),command)).rejects.toThrow('禁用');
 await host('commandConfig',{action:'patch',id:command,patch:{disabled:false}});await launch('filesearch.png');expect(await done()).toContain('Nexlet');
});
test('文件选择在读取前拒绝超限文件，并显示损坏图片错误',async()=>{
 await host('launch',{id:`plugin:${id}:recognize`});
 await read(`(()=>{const input=document.querySelector('#file'),transfer=new DataTransfer();const file=new File([new Uint8Array(21*1024*1024)],'large.png',{type:'image/png'});transfer.items.add(file);input.files=transfer.files;input.dispatchEvent(new Event('change'));})()`);
 await expect.poll(()=>read('document.querySelector("#status").textContent')).toContain('20 MB');
 await read(`(()=>{const input=document.querySelector('#file'),transfer=new DataTransfer();transfer.items.add(new File(['broken'],'bad.png',{type:'image/png'}));input.files=transfer.files;input.dispatchEvent(new Event('change'));})()`);
 await expect.poll(()=>read('document.querySelector("#status").textContent')).toContain('有效图片');expect(await read('document.querySelector("#stop").hidden')).toBe(true);
});
test('缺失模型本地报错，卸载清理插件而保留偏好',async()=>{
 const model=await app.evaluate(()=>{const n=(globalThis as any).__nexlet;return n.plugins.records().find((p:any)=>p.manifest.id==='org.nexlet.ocr').directory+'/models/PP-OCRv6_small_det_onnx_infer.tar';});await unlink(model);
 await launch('filesearch.png');await done();expect(await read('document.querySelector("#status").textContent')).not.toBe('识别完成');expect(await read('document.querySelector("#result").value')).toBe('');
 await host('commandConfig',{action:'patch',id:`plugin:${id}:recognize`,patch:{aliases:['my-ocr']}});await host('pluginRemove',{id,deleteData:false});expect(await app.evaluate(()=>(globalThis as any).__nexlet.plugins.records().some((p:any)=>p.manifest.id==='org.nexlet.ocr'))).toBe(false);
 expect((await host('state') as any).commandConfig.commands[`plugin:${id}:recognize`].aliases).toEqual(['my-ocr']);
});
