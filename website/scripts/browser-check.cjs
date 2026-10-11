const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const base=process.env.SITE_URL||'http://127.0.0.1:4173';
const routes=['/','/download/','/privacy/','/plugins/'];
(async()=>{
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  try{
    await fs.mkdir(path.join(root,'.qa'),{recursive:true});
    const page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    for(const width of [1440,768,390,320]){
      await page.setViewportSize({width,height:900});
      for(const route of routes){
        const response=await page.goto(base+route);assert.equal(response.status(),200);
        await page.evaluate(()=>document.fonts.ready);
        assert.equal(await page.locator('h1').count(),1);
        for(const image of await page.locator('img').all()){await image.scrollIntoViewIfNeeded();await image.evaluate(el=>el.decode());}
        await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
        const dimensions=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,broken:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src)}));
        assert(dimensions.scroll<=dimensions.viewport,`${width} ${route}: horizontal overflow`);
        assert.deepEqual(dimensions.broken,[],`${width} ${route}: broken images`);
        if(route==='/'&&[1440,390].includes(width))await page.screenshot({path:path.join(root,'.qa',`home-${width}.png`),fullPage:true});
      }
    }
    await page.setViewportSize({width:390,height:844});await page.goto(base+'/');
    await page.keyboard.press('Tab');assert.equal(await page.locator('.skip-link').evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>location.hash),'#main');
    const menu=page.getByRole('button',{name:/菜单/});await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#navigation').isVisible(),true);
    await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');assert.equal(await menu.evaluate(el=>el===document.activeElement),true);
    await menu.click();await page.locator('#navigation').getByRole('link',{name:'下载与入门'}).click();assert.equal(new URL(page.url()).pathname,'/download/');
    await page.goto(base+'/');const question=page.locator('details').nth(1);await question.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await question.getAttribute('open'),'');
    const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});const plain=await nojs.newPage();
    for(const route of routes){await plain.goto(base+route);assert.equal(await plain.locator('nav').isVisible(),true);assert.equal(await plain.locator('h1').isVisible(),true);assert((await plain.locator('main').innerText()).length>500);}
    await nojs.close();assert.deepEqual(errors,[]);
    if(!process.env.SITE_URL){
      await page.setViewportSize({width:1200,height:630});
      await page.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#f4f4f2;color:#24252d;font-family:"Segoe UI","Microsoft YaHei",sans-serif;width:1200px;height:630px;padding:58px 64px}.logo{display:flex;align-items:center;gap:13px;font-size:28px;font-weight:700}.logo img{width:44px;height:44px}h1{font-size:59px;letter-spacing:-2px;line-height:1.3;margin:48px 0 20px}h1 span{color:#5a51dd}p{font-size:19px;color:#656672;line-height:1.8}.content{display:grid;grid-template-columns:1fr 1.22fr;gap:35px;align-items:center}.screen{padding:27px 20px;background:#e8e8f0;border-radius:20px}.screen img{width:100%;border-radius:11px;box-shadow:0 20px 30px #3432401a}.foot{position:absolute;bottom:48px;left:64px;font-size:16px;color:#6c6c79;letter-spacing:1px}</style></head><body><div class="logo"><img src="${base}/assets/icon.png" alt="">Nexlet</div><div class="content"><div><h1>常用工具，<br><span>随叫随到。</span></h1><p>应用搜索 · 剪贴板 · 计算稿纸<br>一个顺手的桌面工具箱</p></div><div class="screen"><img src="${base}/assets/launcher.png" alt="真实启动器界面"></div></div><div class="foot">Windows 与 macOS · 预览阶段</div></body></html>`);
      await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(root,'assets/social.png')});
    }
    const report={date:new Date().toISOString(),base,viewports:[1440,768,390,320],pages:routes,checks:['HTTP 200','no viewport overflow','all images loaded','keyboard skip link','mobile menu and Escape focus','navigation','keyboard FAQ','no-JavaScript content and navigation','no page errors'],status:'passed'};
    await fs.writeFile(path.join(root,'.qa','browser-results.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
