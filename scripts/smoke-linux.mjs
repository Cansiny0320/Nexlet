import { _electron as electron } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
const exec=promisify(execFile);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const quote=value=>'"'+value.replace(/%/g,'%%').replace(/[\\"`$]/g,'\\$&').replace(/\\/g,'\\\\')+'"';
export async function prepareLinuxSmoke(data,env){
 env.XDG_CONFIG_HOME=path.join(data,'config');env.XDG_DATA_HOME=path.join(data,'share');
 const applications=path.join(env.XDG_DATA_HOME,'applications');await mkdir(applications,{recursive:true});
 const icons=path.join(env.XDG_DATA_HOME,'icons/hicolor/48x48/apps');await mkdir(icons,{recursive:true});await copyFile('assets/icon.png',path.join(icons,'nexlet-smoke.png'));
 const script=path.join(data,'desktop-fixture.cjs'),marker=path.join(data,'desktop-launched');
 await writeFile(script,`require('node:fs').writeFileSync(${JSON.stringify(marker)},'launched');`);
 await writeFile(path.join(applications,'nexlet-smoke.desktop'),`[Desktop Entry]\nType=Application\nName=Nexlet Linux Fixture\nIcon=nexlet-smoke\nExec=${quote(process.execPath)} ${quote(script)}\nTerminal=false\n`);
 return marker;
}
export async function smokeLinux(application,page,data,marker){
 const folder=path.join(data,'文件 搜索');await mkdir(folder);
 const files=[path.join(folder,'中文 空格 % #.txt'),path.join(folder,'second.txt')];await Promise.all(files.map(f=>writeFile(f,'fixture')));
 await page.evaluate(folder=>window.nexlet.call('settings',{fileSearchPaths:[folder],shortcut:'Control+Alt+Space'}),folder);
 const found=await page.evaluate(()=>window.nexlet.call('fileSearch','中文 ext:txt'));
 if(found.status!=='ready'||found.items[0]?.path!==files[0])throw Error('Linux scoped filename search failed: '+JSON.stringify(found));
 await page.evaluate(files=>window.nexlet.call('clipAction',{action:'writeFiles',files}),files);
 await page.evaluate(()=>window.nexlet.call('clipAction',{action:'capture'}));
 const clips=await page.evaluate(()=>window.nexlet.call('clips',{kind:'files'}));
 if(!clips.some(c=>JSON.stringify(c.files)===JSON.stringify(files)))throw Error('Linux native file clipboard round trip failed');
 const formats=await application.evaluate(async({clipboard})=>Promise.all((await clipboard.read()).flatMap(item=>item.types.map(async type=>({type,text:(await item.getType(type)).text?await (await item.getType(type)).text():''})))));
 if(!formats.some(f=>f.type.includes('gnome-copied-files')&&f.text.startsWith('copy\nfile:')))throw Error('Missing Linux file-manager clipboard format');
 if(!(await page.evaluate(()=>window.nexlet.call('startup',true))).enabled)throw Error('Linux startup enable failed');
 if(!(await page.evaluate(()=>window.nexlet.call('state'))).startup.enabled)throw Error('Linux startup readback failed');
 if((await page.evaluate(()=>window.nexlet.call('startup',false))).enabled)throw Error('Linux startup disable failed');
 await page.evaluate(()=>window.nexlet.call('rescan'));
 const appState=await page.evaluate(()=>window.nexlet.call('state'));
 const fixture=appState.commands.find(c=>c.name==='Nexlet Linux Fixture');if(!fixture)throw Error('XDG desktop app was not indexed');
 const icons=await page.evaluate(id=>window.nexlet.call('catalogIcons',[id]),fixture.id);if(!icons[0]?.icon?.startsWith('data:image/'))throw Error('Linux theme icon did not resolve');
 await page.evaluate(id=>window.nexlet.call('launch',{id}),fixture.id);
 let launched=false;for(let i=0;i<30;i++){if(await readFile(marker,'utf8').catch(()=>'')==='launched'){launched=true;break;}await delay(100);}if(!launched)throw Error('GIO desktop launch failed');
 // A separate Electron process is a real external paste target, not a mocked host window.
 const helper=path.join(data,'paste-target.cjs');
 await writeFile(helper,`const {app,BrowserWindow}=require('electron');app.whenReady().then(async()=>{const w=new BrowserWindow({width:500,height:300});await w.loadURL('data:text/html,<textarea autofocus aria-label="paste target"></textarea>');w.show();w.focus();});`);
 const external=await electron.launch({args:[helper,...(process.getuid?.()===0?['--no-sandbox']:[])],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined},timeout:25000});
 try{
  const target=await external.firstWindow();await target.locator('textarea').focus();
  await external.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();});await delay(300);
  await exec('xdotool',['key','ctrl+alt+space']);
  let remembered=false;for(let i=0;i<30;i++){if((await page.evaluate(()=>window.nexlet.call('state'))).canPaste){remembered=true;break;}await delay(100);}if(!remembered)throw Error('X11 hotkey did not remember external target');
  const text='Nexlet Linux external paste ✓';await page.evaluate(text=>window.nexlet.call('clipAction',{action:'writeText',text}),text);await page.evaluate(()=>window.nexlet.call('clipAction',{action:'capture'}));
  const clip=(await page.evaluate(()=>window.nexlet.call('clips',{query:'Nexlet Linux external paste'})))[0];
  if(!clip)throw Error('Missing external paste fixture');await page.evaluate(id=>window.nexlet.call('clipAction',{action:'paste',ids:[id]}),clip.id);
  let pasted=false;for(let i=0;i<30;i++){if(await target.locator('textarea').inputValue()===text){pasted=true;break;}await delay(100);}if(!pasted)throw Error('X11 external application did not receive pasted text');
 }finally{await external.close();}
 await application.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.webContents.send('host-change','open-view:filesearch');});
 await page.getByRole('textbox',{name:'Linux 文件搜索',exact:true}).fill('中文 ext:txt');
 await page.getByText('中文 空格 % #.txt',{exact:true}).first().waitFor();
 await page.screenshot({path:'test-results/linux-file-search.png'});
 await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('host-change','open-view:settings'));
 await page.getByText('Linux 文件搜索',{exact:true}).waitFor();
 await page.screenshot({path:'test-results/linux-settings.png'});
 return {fileSearch:'real directory fixture passed',fileClipboard:'two native formats round-tripped',desktopLaunch:'XDG + gio passed',startup:'enable/readback/disable passed',externalPaste:'separate process received text through X11'};
}
