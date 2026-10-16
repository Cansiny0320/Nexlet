import { prepareLinuxSmoke, smokeLinux } from './smoke-linux.mjs';
import { _electron as electron } from '@playwright/test';
import { mkdir,mkdtemp,readFile,writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

await mkdir('.tmp',{recursive:true});
const data=await mkdtemp(path.resolve('.tmp','packaged-smoke-'));
const db=new DatabaseSync(path.join(data,'nexlet.sqlite'));
db.exec('CREATE TABLE documents (key TEXT PRIMARY KEY,value TEXT NOT NULL)');
db.prepare('INSERT INTO documents VALUES (?,?)').run('settings',JSON.stringify({clipboardEnabled:false,hideOnBlur:false,theme:'light',language:'zh-CN'}));
db.close();
const env={...process.env,NEXLET_USER_DATA:data};delete env.ELECTRON_RUN_AS_NODE;delete env.NEXLET_TEST_MODE;
const linuxMarker=process.platform==='linux'?await prepareLinuxSmoke(data,env):null;
const executablePath=path.resolve(process.argv[2]||'release/win-unpacked/Nexlet.exe');
const application=await electron.launch({executablePath,args:process.platform==='linux'&&process.getuid?.()===0?['--no-sandbox']:[],env,timeout:25000});
try{
  const page=await application.firstWindow();await page.getByRole('textbox',{name:'搜索功能、应用或快捷方式'}).waitFor();
  const info=await application.evaluate(({app,screen})=>({packaged:app.isPackaged,version:app.getVersion(),platform:process.platform,arch:process.arch,appImage:!!process.env.APPIMAGE,displays:screen.getAllDisplays().map(d=>({scale:d.scaleFactor,width:d.workArea.width,height:d.workArea.height}))}));
  if(!info.packaged)throw Error('Expected packaged app');
  if(info.arch!==process.arch)throw Error('Packaged app architecture does not match the native runner');
  if(info.version!==JSON.parse(await readFile('package.json','utf8')).version)throw Error('Packaged version does not match source');
  if(await page.getByRole('button',{name:'固定窗口',exact:true}).count())throw Error('Launcher must not have a pin button');
  const state=await page.evaluate(()=>window.nexlet.call('state'));if(state.nativeStatus)throw Error(state.nativeStatus);
  if(info.platform==='linux'&&state.update.mode!==(info.appImage?'automatic':'portable'))throw Error('Wrong Linux update transport mode');
  if(process.platform==='win32'&&(await page.evaluate(()=>window.nexlet.call('fileSearch',''))).status!=='idle')throw Error('Empty file search must stay idle');
  await application.evaluate(async({clipboard,ClipboardItem})=>{const values={};for(const item of await clipboard.read())for(const type of item.types)if(['text/plain','text/html','image/png','text/rtf'].includes(type))values[type]=await item.getType(type);globalThis.__smokeClipboard=Object.keys(values).length?[new ClipboardItem(values)]:[];});
  await page.evaluate(()=>window.nexlet.call('settings',{clipboardEnabled:true}));
  await application.evaluate(async({clipboard})=>{await clipboard.writeText('Nexlet packaged clipboard monitor');});
  const deadline=Date.now()+8000;let captured=false;
  while(Date.now()<deadline){const clips=await page.evaluate(()=>window.nexlet.call('clips',{query:'Nexlet packaged clipboard monitor'}));if(clips.length){captured=true;break;}await new Promise(r=>setTimeout(r,250));}
  if(!captured)throw Error('Packaged background clipboard capture failed');
  await page.getByRole('textbox',{name:'搜索功能、应用或快捷方式'}).fill('128*3');await page.locator('[data-command-id="match:calc"]').click();
  if(await page.locator('output').first().innerText()!=='384')throw Error('Packaged calculation failed');
  await page.getByRole('button',{name:'固定窗口',exact:true}).waitFor();
  await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/packaged-scratchpad.png'});
  const linux=info.platform==='linux'?await smokeLinux(application,page,data,linuxMarker):undefined;
  let files=linux?.fileSearch||'not supported on this platform';
  if(info.platform==='win32'){
    const fixture=path.join(data,'file-search-fixture');await mkdir(fixture);await writeFile(path.join(fixture,'Nexlet packaged search.txt'),'packaged engine');
    await page.evaluate(folder=>window.nexlet.call('settings',{fileSearchPaths:[folder]}),fixture);
    let found=false;const until=Date.now()+20000;
    while(Date.now()<until){const result=await page.evaluate(()=>window.nexlet.call('fileSearch','Nexlet packaged search'));if(result.items.some(i=>i.name==='Nexlet packaged search.txt')){found=true;break;}if(result.status!=='indexing')throw Error(result.message);await new Promise(r=>setTimeout(r,400));}
    if(!found)throw Error('Packaged Everything search failed');files='bundled engine searched a real fixture';
  }
  const finalState=await page.evaluate(()=>window.nexlet.call('state'));
  console.log(JSON.stringify({...info,...(linux?{linux}:{}),nativeBridge:'ready',backgroundCapture:'passed',calculation:'384',fileSearch:files,shortcutStatus:finalState.shortcutError||'registered',executable:executablePath},null,2));
}finally{
  await application.evaluate(async({clipboard})=>{if(globalThis.__smokeClipboard?.length)await clipboard.write(globalThis.__smokeClipboard);}).catch(()=>{});
  await application.close();
}
