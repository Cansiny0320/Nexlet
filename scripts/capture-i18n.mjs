// Captures documented UI with isolated sample data. Requires npm run build.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const directory=await mkdtemp(path.join(tmpdir(),'nexlet-i18n-shots-'));
const env={...process.env,NEXLET_TEST_MODE:'1',NEXLET_TEST_LOCALE:'en',NEXLET_USER_DATA:directory};delete env.ELECTRON_RUN_AS_NODE;
const messages={en:JSON.parse(await readFile(path.join(root,'src/shared/locales/en.json'),'utf8')),'zh-Hant':JSON.parse(await readFile(path.join(root,'src/shared/locales/zh-Hant.json'),'utf8'))};
let app;
try{
 app=await electron.launch({args:[root],cwd:root,env});
 const page=await app.firstWindow();await expect(page.locator('.launcher-input')).toBeVisible();
 const call=(action,payload)=>page.evaluate(({action,payload})=>window.nexlet.call(action,payload),{action,payload});
 await call('settings',{theme:'light',hideOnBlur:false,clipboardEnabled:false});
 await expect.poll(() => call('state').then(state => state.catalogLoading)).toBe(false);
 const entries=JSON.parse(await readFile(path.resolve(root,'../Nexlet-plugins/index.json'),'utf8'));
 await app.evaluate((_,entries)=>{
  const n=globalThis.__nexlet;n.clips.stop();n.store.deleteClips(n.store.clips().map(i=>i.id));
  const samples=['A small idea, saved for later.','const answer = 128 * 3;','https://github.com/Cansiny0320/Nexlet','Hello, Nexlet! 🌏'];
  for(const [i,text] of samples.entries())n.store.addClip({id:'sample-'+i,kind:'text',text,hash:'sample-'+i,createdAt:Date.now()+i,favorite:i===0});
  n.store.set('pads',[{id:'sample-pad',name:'Project estimate',createdAt:Date.now(),updatedAt:Date.now(),locked:false,color:'#e9e6df',lines:[{id:'a',expression:'128*3',note:'Design'},{id:'b',expression:'384+256',note:'Development'},{id:'c',expression:'640*1.1',note:'Total + 10%'}]}]);
  n.marketplace.download=async()=>Buffer.from(JSON.stringify(entries));
 },entries);
 const navigate=async view=>{await app.evaluate((_,view)=>{const n=globalThis.__nexlet;n.main.show();n.main.webContents.send('host-change','navigate:'+view);},view);};
 for(const locale of ['en','zh-Hant']){
  const t=key=>messages[locale][key]||key;
  const out=path.join(root,'docs/screenshots',locale);await mkdir(out,{recursive:true});
  await call('settings',{language:locale});await expect(page.locator('html')).toHaveAttribute('lang',locale);
  await navigate('launcher');await expect(page.locator('.launcher-input')).toBeVisible();await page.screenshot({path:path.join(out,'launcher.png')});
  await navigate('scratchpad');await expect(page.locator('output').first()).toHaveText('384');await page.screenshot({path:path.join(out,'scratchpad.png')});
  await navigate('clipboard');await expect(page.locator('.clip-item')).toHaveCount(4);await page.screenshot({path:path.join(out,'clipboard.png')});
  await navigate('json');await page.getByRole('tab',{name:t('JSON 对比'),exact:true}).click();
  await page.getByRole('textbox',{name:t('原始 JSON'),exact:true}).fill('{"name":"Nexlet","version":"0.2","theme":"light","tools":["clipboard","json"]}');
  await page.getByRole('textbox',{name:t('修改后的 JSON'),exact:true}).fill('{"name":"Nexlet","version":"0.3","theme":"system","tools":["clipboard","json","scratchpad"]}');
  await page.getByRole('button',{name:t('开始对比'),exact:true}).click();await expect(page.locator('.cm-deletedLine').first()).toBeVisible();await page.screenshot({path:path.join(out,'json-diff.png')});
  await call('marketplace',true);await navigate('plugins');await expect(page.locator('.market-card').first()).toBeVisible();await page.screenshot({path:path.join(out,'marketplace.png')});
  await navigate('settings');await expect(page.getByRole('combobox',{name:t('语言'),exact:true})).toBeVisible();await page.screenshot({path:path.join(out,'settings.png')});
  console.log('Captured '+locale+' desktop screenshots with sample data');
 }
}finally{await app?.close();await rm(directory,{recursive:true,force:true});}
