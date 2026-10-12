const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const base=process.env.SITE_URL||'http://127.0.0.1:4173';
const routes=['/','/download/','/privacy/','/plugins/'];
const downloads=require('../downloads.json');
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 try{
  await fs.mkdir(path.join(root,'.qa'),{recursive:true});
  const page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  const dimensions=[];
  for(const width of [1065,1107,1440,768,390,320]){
   await page.setViewportSize({width,height:900});
   for(const route of routes){
    const response=await page.goto(base+route);assert.equal(response.status(),200);
    await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('h1').count(),1);
    const d=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}));
    assert(d.scroll<=d.width,`${width} ${route}: horizontal overflow ${d.scroll}`);dimensions.push({route,...d});
    if([390,1440].includes(width)||(width===1065&&route==='/')||(width===1107&&route!=='/'))await page.screenshot({path:path.join(root,'.qa',`${route==='/'?'home':route.replaceAll('/','')}-${width}.png`),fullPage:true});
   }
  }
  await page.setViewportSize({width:1065,height:900});await page.goto(base+'/');await page.evaluate(()=>document.fonts.ready);
  assert.match(await page.locator('[data-primary-download]').first().getAttribute('href'),/Windows-x64\.exe$/);
  const toggle=page.locator('.download-toggle').first();await toggle.click();
  await page.screenshot({path:path.join(root,'.qa','home-1065-menu.png'),fullPage:true});
  await page.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  await toggle.focus();await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#hero-downloads button').first().evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  for(const link of await page.locator('[data-primary-download]').all())assert.match(await link.getAttribute('href'),/macOS-arm64\.dmg$/);
  await toggle.click();await page.locator('h1').click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/');
  await page.keyboard.press('Tab');assert.equal(await page.locator('.skip-link').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>location.hash),'#main');
  const menu=page.getByRole('button',{name:/菜单/});await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');assert.equal(await menu.evaluate(el=>el===document.activeElement),true);
  await menu.click();await page.locator('#navigation').getByRole('link',{name:'下载',exact:true}).click();assert.equal(new URL(page.url()).pathname,'/download/');
  const question=page.locator('details').nth(1);await question.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await question.getAttribute('open'),'');
  // Clipboard actions report their outcome; verify the exact value without changing the host clipboard.
  await page.goto(base+'/privacy/');await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copied=text;}}}));
  await page.getByRole('button',{name:'复制 Windows 数据目录'}).click();assert.equal(await page.evaluate(()=>window.copied),'%APPDATA%/Nexlet');
  await page.locator('.privacy-sidebar a[href="#website"]').click();assert.equal(await page.locator('#website').getAttribute('open'),'');
  const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});const plain=await nojs.newPage();
  for(const route of routes){await plain.goto(base+route);assert.equal(await plain.locator('#navigation').isVisible(),true);assert.equal(await plain.locator('h1').isVisible(),true);}
  await plain.goto(base+'/download/');assert.equal(await plain.locator('[data-direct-download]').count(),3);for(const a of await plain.locator('[data-direct-download]').all())assert.equal(await a.getAttribute('href'),downloads.platforms[await a.getAttribute('data-direct-download')].url);
  await nojs.close();
  // A late high-entropy response must never replace the user's selected architecture.
  const delayed=await browser.newContext();await delayed.addInitScript(()=>{Object.defineProperty(navigator,'userAgentData',{value:{platform:'macOS',mobile:false,getHighEntropyValues:()=>new Promise(resolve=>{window.resolvePlatform=resolve;})}});Object.defineProperty(navigator,'userAgent',{value:'Macintosh; Intel Mac OS X'});});
  const late=await delayed.newPage();await late.goto(base+'/');assert.equal(await late.locator('[data-primary-download]').first().getAttribute('href'),'/download/');
  await late.locator('.download-toggle').first().click();await late.locator('#hero-downloads [data-platform="macos-x64"]').click();
  await late.evaluate(()=>window.resolvePlatform({platform:'macOS',architecture:'arm',bitness:'64'}));
  assert.match(await late.locator('[data-primary-download]').first().getAttribute('href'),/macOS-x64\.dmg$/);await delayed.close();
  const armWindows=await browser.newContext();await armWindows.addInitScript(()=>{Object.defineProperty(navigator,'userAgentData',{value:{platform:'Windows',mobile:false,getHighEntropyValues:async()=>({architecture:'arm',bitness:'64'})}});});
  const armPage=await armWindows.newPage();await armPage.goto(base+'/');assert.equal(await armPage.locator('[data-primary-download]').first().getAttribute('href'),'/download/');await armWindows.close();
  const denied=await browser.newContext();await denied.addInitScript(()=>{Object.defineProperty(navigator,'userAgentData',{value:{platform:'macOS',mobile:false,getHighEntropyValues:async()=>{throw new Error('Unavailable');}}});Object.defineProperty(navigator,'userAgent',{value:'Macintosh; Intel Mac OS X'});});
  const deniedPage=await denied.newPage();await deniedPage.goto(base+'/');assert.equal(await deniedPage.locator('[data-primary-download]').first().getAttribute('href'),'/download/');await denied.close();
  assert.deepEqual(errors,[]);
  const report={date:new Date().toISOString(),base,dimensions,checks:['HTTP 200','no viewport overflow','keyboard skip link','mobile menu and Escape focus','split download selection and keyboard navigation','outside click close','manual choice wins late detection','copied data path','keyboard FAQ','no-JavaScript direct downloads','no page errors'],status:'passed'};
  await fs.writeFile(path.join(root,'.qa','browser-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
