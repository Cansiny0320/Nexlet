import {test,expect,_electron as electron,type ElectronApplication} from '@playwright/test';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
let app:ElectronApplication;
test.beforeAll(async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'nexlet-ocr-quality-'));
 const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),NEXLET_TEST_MODE:'1',NEXLET_USER_DATA:folder};delete env.ELECTRON_RUN_AS_NODE;
 const executablePath=process.env.NEXLET_E2E_EXECUTABLE;app=await electron.launch({executablePath,args:executablePath?[]:[process.cwd()],env});await app.firstWindow();
});
test.afterAll(async()=>{await app?.close();});
const samples=[
 {file:'settings-dark.png',text:['快捷键与窗口','全局唤起','Alt+Space','切换到其他应用时收起主搜索框，独立窗口保持显示','仅保存在本机；暂停后仍可查看已有记录','500条']},
 {file:'marketplace-live.png',text:['插件市场','字数统计','便笺','Google免Key翻译与可配置的LLM翻译','Windows','macOS','Linux','v1.1.0']},
 {file:'filesearch.png',text:['文件搜索','Nexlet搜索验收.txt','2026-10-1201:12','30B','1个索引目录']},
 {file:'json-diff.png',text:['忽略键顺序','修改后的JSON','autoSave','false','true','clipboard','scratchpad','3处差异']},
];
for(const sample of samples)test(`真实界面截图 OCR：${sample.file}`,async()=>{
 const bytes=await readFile(path.join('docs/screenshots',sample.file));
 const text=await app.evaluate(async(_,base64)=>(globalThis as any).__nexlet.desktopTools.ocr.recognize(Buffer.from(base64,'base64')),bytes.toString('base64'));
 const normalized=text.normalize('NFKC').replace(/\s/g,'');for(const part of sample.text)expect(normalized).toContain(part.normalize('NFKC'));
 expect(await app.evaluate(({BrowserWindow,ipcMain})=>({windows:BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().startsWith('nexlet-ocr:')).length,ready:ipcMain.listenerCount('ocr-ready'),report:ipcMain.listenerCount('ocr-report')}))).toEqual({windows:0,ready:0,report:0});
});
test('识别进程隔离宿主 API、拒绝联网与本地任意文件，并忽略其他窗口伪造的结果',async()=>{
 const image=(await readFile('docs/screenshots/marketplace-live.png')).toString('base64');
 await app.evaluate((_,base64)=>{(globalThis as any).ocrIsolationJob=(globalThis as any).__nexlet.desktopTools.ocr.recognize(Buffer.from(base64,'base64'));},image);
 await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL()==='nexlet-ocr://engine/ocr.html'))).toBe(true);
 const state=await app.evaluate(async({BrowserWindow,ipcMain})=>{
  const n=(globalThis as any).__nexlet,engine=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='nexlet-ocr://engine/ocr.html')!;
  ipcMain.emit('ocr-report',{sender:n.main.webContents,senderFrame:n.main.webContents.mainFrame},{type:'result',text:'SPOOFED'});
  const preferences=(engine.webContents as any).getLastWebPreferences();
  const checks=await engine.webContents.executeJavaScript(`(async()=>({host:typeof window.nexlet,desktop:typeof window.desktopTools,node:typeof require,remoteBlocked:await fetch('https://example.invalid/ocr-test').then(()=>false,()=>true),fileBlocked:await fetch('file:///etc/passwd').then(()=>false,()=>true)}))()`);
  return {sandbox:preferences.sandbox,contextIsolation:preferences.contextIsolation,nodeIntegration:preferences.nodeIntegration,...checks};
 });
 expect(state).toEqual({sandbox:true,contextIsolation:true,nodeIntegration:false,host:'undefined',desktop:'undefined',node:'undefined',remoteBlocked:true,fileBlocked:true});
 expect(await app.evaluate(async()=>await (globalThis as any).ocrIsolationJob)).toContain('插件市场');
});
