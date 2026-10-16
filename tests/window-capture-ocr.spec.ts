import {test,expect,_electron as electron,type ElectronApplication,type Page} from '@playwright/test';
import {mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
let app:ElectronApplication,main:Page,folder:string;const errors:string[]=[];
const host=(action:string,payload?:unknown)=>main.evaluate(({action,payload})=>window.nexlet.call(action as any,payload),{action,payload});
const desktop=(page:Page,action:string,payload?:unknown)=>page.evaluate(({action,payload})=>window.desktopTools.call(action,payload),{action,payload});
async function image(text='Nexlet OCR 12345\n离线文字识别 测试成功'){
 return main.evaluate(text=>{const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=280;const c=canvas.getContext('2d')!;c.fillStyle='white';c.fillRect(0,0,1000,280);c.fillStyle='#111';c.font='48px Arial, sans-serif';text.split('\n').forEach((line,i)=>c.fillText(line,35,80+i*80));return canvas.toDataURL();},text);
}
async function home(){await app.evaluate(()=>{const n=(globalThis as any).__nexlet;n.main.show();n.main.webContents.send('host-change','navigate:launcher');});await expect(main.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();}
async function launchCapture(){
 const waiting=app.waitForEvent('window');
 await app.evaluate(()=>{const n=(globalThis as any).__nexlet;(globalThis as any).captureTask=n.executeCommand(n.main,{id:'capture:region'}).catch((e:any)=>{(globalThis as any).captureError=e.message;});});
 const page=await waiting;await expect(page.locator('.capture-surface')).toBeVisible();return page;
}
test.beforeAll(async()=>{
 folder=await mkdtemp(path.join(tmpdir(),'nexlet-desktop-tools-'));const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),NEXLET_TEST_MODE:'1',NEXLET_USER_DATA:folder};delete env.ELECTRON_RUN_AS_NODE;
 const executablePath=process.env.NEXLET_E2E_EXECUTABLE;
 app=await electron.launch({executablePath,args:executablePath?[]:[process.cwd()],env});main=await app.firstWindow();app.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));await home();
 await app.evaluate(async({clipboard,nativeImage,desktopCapturer,screen,systemPreferences,dialog})=>{
  (globalThis as any).desktopMainErrors=[];
  dialog.showErrorBox=(title,content)=>{(globalThis as any).desktopMainErrors.push(title+'\n'+content);};
  const n=(globalThis as any).__nexlet;(globalThis as any).savedClipboard=await n.selectionPlatform.snapshot();
  for(const name of ['write','writeText'] as const){const original=(clipboard[name] as any).bind(clipboard);(clipboard as any)[name]=async(...args:any[])=>{const result=await original(...args);(globalThis as any).clipboardVersion=n.platform.sequence();return result;};}
  const display=screen.getPrimaryDisplay();screen.getCursorScreenPoint=()=>({x:display.bounds.x+50,y:display.bounds.y+50});(systemPreferences as any).getMediaAccessStatus=()=> 'granted';
  (desktopCapturer as any).getSources=async()=>{const width=display.bounds.width,height=display.bounds.height,bytes=Buffer.alloc(width*height*4);for(let i=0;i<bytes.length;i+=4){bytes[i]=20;bytes[i+1]=180;bytes[i+2]=40;bytes[i+3]=255;}return [{id:'screen:fixture:0',display_id:String(display.id),thumbnail:nativeImage.createFromBitmap(bytes,{width,height}),name:'Fixture'}];};
 });
});
test.afterEach(async()=>{expect(await app.evaluate(()=>(globalThis as any).desktopMainErrors)).toEqual([]);});
test.afterAll(async()=>{if(app){await app.evaluate(async()=>{const g=globalThis as any,n=g.__nexlet;if(g.savedClipboard&&g.clipboardVersion!==undefined&&n.platform.sequence()===g.clipboardVersion)await n.selectionPlatform.restore(g.savedClipboard,g.clipboardVersion);});await app.close();}});

test('截图权限请求失败时打开对应系统设置，保留主窗口并允许重试',async()=>{
 test.skip(process.platform!=='darwin');await home();
 const result=await app.evaluate(async({systemPreferences,shell,app})=>{
  const n=(globalThis as any).__nexlet,koffi=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json')('koffi'),originalStatus=systemPreferences.getMediaAccessStatus,originalOpen=shell.openExternal,originalLoad=koffi.load;
  let requests=0;const opened:string[]=[];
  systemPreferences.getMediaAccessStatus=()=> 'denied';shell.openExternal=async url=>{opened.push(url);};
  koffi.load=(file:string)=>file.includes('CoreGraphics')?{func:()=>()=>{requests++;return false;}}:originalLoad(file);
  try{let error='';try{await n.desktopTools.screenshot('region','launcher');}catch(e){error=(e as Error).message;}return {requests,opened,error,busy:n.desktopTools.capture.busy,visible:n.main.isVisible()};}
  finally{systemPreferences.getMediaAccessStatus=originalStatus;shell.openExternal=originalOpen;koffi.load=originalLoad;}
 });
 expect(result.requests).toBe(1);expect(result.opened).toEqual(['x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture']);expect(result.error).toContain('已打开');expect(result.busy).toBe(false);expect(result.visible).toBe(true);
});
test('工具目录和搜索不再展示窗口布局入口',async()=>{
 const state:any=await host('state');
 expect(state.commands.filter((command:any)=>command.id.startsWith('window:'))).toEqual([]);
 expect(state.commandCatalog.filter((command:any)=>command.id.startsWith('window:'))).toEqual([]);
 await home();const search=main.getByLabel('搜索功能、应用或快捷方式');await search.fill('分屏');
 await expect(main.locator('[data-command-id^="window:"]')).toHaveCount(0);await search.fill('');
});
test('省略的功能名称在网格和列表悬停提示中保留全文',async()=>{
 await home();const search=main.getByLabel('搜索功能、应用或快捷方式');await search.fill('当前屏截图');
 const button=main.getByRole('button',{name:'当前屏截图',exact:true});await button.hover();await expect(button).toHaveAttribute('title',/^当前屏截图\n/);
 await main.getByRole('button',{name:'列表展示',exact:true}).click();await expect(button).toHaveAttribute('title',/^当前屏截图\n/);
 await main.getByRole('button',{name:'网格展示',exact:true}).click();await search.fill('');
});
test('截图取消不改变剪贴板，完成后作为宿主图片输入进入搜索',async()=>{
 await app.evaluate(async({clipboard})=>{await clipboard.writeText('nexlet-capture-original');});
 let page=await launchCapture();await page.keyboard.press('Escape').catch(e=>{if(!e.message.includes('closed'))throw e;});await expect.poll(()=>app.evaluate(({clipboard})=>clipboard.readText())).toBe('nexlet-capture-original');
 page=await launchCapture();await page.mouse.move(100,150);await page.mouse.down();await page.mouse.move(460,370);await page.mouse.up();await expect(page.getByLabel('完成截图')).toBeVisible();await page.getByLabel('完成截图').click();await app.evaluate(async()=>{await (globalThis as any).captureTask;});
 await expect(main.getByAltText('待处理图片')).toBeVisible();
 const result=await app.evaluate(async({nativeImage})=>{const n=(globalThis as any).__nexlet,s=(n.inputs as any).owners.get(n.main.webContents.id).snapshot;const bytes=await n.inputs.readResource(s,s.input.image.id);return {from:s.input.from,size:nativeImage.createFromBuffer(Buffer.from(bytes)).getSize()};});
 expect(result).toEqual({from:'capture',size:{width:360,height:220}});await expect(main.getByText('OCR 文字识别',{exact:true})).toHaveCount(0);await expect(main.getByText('贴图',{exact:true})).toBeVisible();
});
test('贴图旋转、缩放、保存和送回搜索保留图片尺寸',async()=>{
 const data=await image('Pin image');const input:any=await host('launchInput',{type:'image',from:'paste',data});
 const waiting=app.waitForEvent('window');await host('launch',{id:'image:pin',inputId:input.id});const pin=await waiting;await expect(pin.getByAltText('悬浮图片')).toBeVisible();await pin.getByLabel('旋转图片').click();
 await expect.poll(async()=>{const state:any=await desktop(pin,'state');return pin.evaluate(data=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve({width:i.width,height:i.height});i.src=data;}),state.image);}).toEqual({width:280,height:1000});
 await pin.getByLabel('放大').click();await pin.getByLabel('缩小').click();
 const file=path.join(folder,'rotated.png');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=(async()=>({canceled:false,filePath:file})) as any;},file);await desktop(pin,'save');expect((await readFile(file)).subarray(1,4).toString()).toBe('PNG');
 await desktop(pin,'launch').catch(e=>{if(!e.message.includes('closed'))throw e;});await expect(main.getByAltText('待处理图片')).toBeVisible();
});
test('显示器变化取消截图，当前屏截图按源像素复制',async()=>{
 await home();const page=await launchCapture();await app.evaluate(({screen})=>{screen.emit('display-metrics-changed',{} as any,screen.getPrimaryDisplay(),['bounds']);});
 await expect.poll(()=>page.isClosed()).toBe(true);expect(await app.evaluate(()=>(globalThis as any).captureError)).toContain('显示器配置已改变');
 const result=await app.evaluate(async({clipboard,nativeImage,screen})=>{const n=(globalThis as any).__nexlet;await n.desktopTools.screenshot('screen','copy');const image=(await clipboard.read()).find(i=>i.types.includes('image/png'))!,blob=await image.getType('image/png') as Blob;return {actual:nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer())).getSize(),expected:{width:screen.getPrimaryDisplay().bounds.width,height:screen.getPrimaryDisplay().bounds.height}};});expect(result.actual).toEqual(result.expected);
});
