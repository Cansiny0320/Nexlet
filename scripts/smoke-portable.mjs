import { chromium } from '@playwright/test';
import { spawn,execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp,mkdir,readFile,writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
await mkdir('.tmp',{recursive:true});const data=await mkdtemp(path.resolve('.tmp','portable-smoke-'));const db=new DatabaseSync(path.join(data,'nexlet.sqlite'));db.exec('CREATE TABLE documents (key TEXT PRIMARY KEY,value TEXT NOT NULL)');db.prepare('INSERT INTO documents VALUES (?,?)').run('settings',JSON.stringify({clipboardEnabled:false,hideOnBlur:false,theme:'light'}));db.close();
const env={...process.env,NEXLET_USER_DATA:data};delete env.ELECTRON_RUN_AS_NODE;delete env.NEXLET_TEST_MODE;
const {version}=JSON.parse(await readFile('package.json','utf8'));
const child=spawn(path.resolve(process.argv[2]||`release/Nexlet-${version}-Windows-x64.exe`),[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env,windowsHide:true,stdio:'ignore'});let browser,page;const errors=[];
try{
  const deadline=Date.now()+45000;let ready=false;
  while(Date.now()<deadline){try{const response=await fetch(`http://127.0.0.1:${port}/json/version`);if(response.ok){ready=true;break;}}catch{}if(child.exitCode!==null)throw Error('Portable process exited: '+child.exitCode);await new Promise(r=>setTimeout(r,300));}
  if(!ready)throw Error('Portable renderer did not start within 45 seconds');
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);page=browser.contexts()[0].pages().find(p=>p.url().includes('/renderer/index.html'));if(!page)throw Error('Nexlet renderer not found');
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.getByRole('textbox',{name:'搜索功能、应用或快捷方式'}).waitFor();const state=await page.evaluate(()=>window.nexlet.call('state'));if(state.nativeStatus)throw Error(state.nativeStatus);
  await page.getByRole('textbox',{name:'搜索功能、应用或快捷方式'}).fill('128*3');await page.getByRole('button',{name:'384',exact:true}).click();if(await page.locator('output').first().innerText()!=='384')throw Error('Portable calculation failed');
  await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/portable-scratchpad.png'});console.log(JSON.stringify({portable:'passed',version:state.version,nativeBridge:'ready',calculation:'384',shortcutStatus:state.shortcutError||'registered'},null,2));
}catch(error){
  await mkdir('test-results',{recursive:true});
  const state=page?await page.evaluate(()=>({url:location.href,body:document.body.innerText,hostApi:typeof window.nexlet})).catch(e=>({error:String(e)})):null;
  await writeFile('test-results/portable-diagnostic.json',JSON.stringify({error:String(error),errors,state},null,2));
  if(page)await page.screenshot({path:'test-results/portable-failure.png'}).catch(()=>{});
  console.error(JSON.stringify({errors,state},null,2));throw error;
}finally{
  if(browser){try{const session=await browser.newBrowserCDPSession();await Promise.race([session.send('Browser.close').catch(()=>{}),new Promise(r=>setTimeout(r,1000))]);}catch{}await Promise.race([browser.close().catch(()=>{}),new Promise(r=>setTimeout(r,1000))]);}
  await new Promise(r=>setTimeout(r,800));
  if(child.exitCode===null)await new Promise(r=>execFile('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>r()));
}
