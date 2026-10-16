// Frozen builds, identical synthetic data, alternating order. Does not read or
// write the system clipboard or install/register either build.
import { _electron as electron } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir, cpus, release } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import path from 'node:path';
const options=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');if(i<3)throw Error('Use --key=value');return [arg.slice(2,i),arg.slice(i+1)];}));
if(!options.before||!options.after||!options.output)throw Error('Required: --before=DIR --after=DIR --output=JSON');
const roots={before:path.resolve(options.before),after:path.resolve(options.after)},runs=Number(options.runs||5);
if(!Number.isInteger(runs)||runs<1)throw Error('Invalid run count');
const output=path.resolve(options.output),exec=promisify(execFile),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={measuredAt:new Date().toISOString(),cpu:cpus()[0].model,os:release(),platform:process.platform,arch:process.arch,node:process.version,
  method:{runs,warmupsPerBuild:1,order:'alternating',clipboard:{count:500,textBytes:32768,systemClipboard:'not accessed'},search:{commands:1000,preferences:100,regexRules:8,samplesPerRun:10},
    startup:'process launch to visible launcher input; includes Playwright overhead; OS caches not cleared',wake:'main-process show() duration until synchronous reveal completes, not display photon latency',
    searchIpc:'renderer clock from invoke to first progress (or final on before) and final response; excludes 60 ms UI debounce',searchUi:'DOM input event to first matching command observed on requestAnimationFrame; includes debounce',
    clipboardOpen:'DOM click to first non-empty rendered clipboard rows, observed on requestAnimationFrame',scroll:'120 animation frames moving through the history; no forced GC',memory:'sum of OS RSS for app.getAppMetrics PIDs; shared pages may be counted more than once'},builds:{},samples:[]};
await mkdir(path.dirname(output),{recursive:true});
for(const [label,root] of Object.entries(roots)){
  const main=await readFile(path.join(root,'dist/main/index.cjs'));
  const entries=(await readdir(path.join(root,'dist/renderer/assets'))).filter(name=>name.endsWith('.js')).sort();
  const hash=createHash('sha256');for(const name of entries)hash.update(name).update(await readFile(path.join(root,'dist/renderer/assets',name)));
  report.builds[label]={root,mainSha256:createHash('sha256').update(main).digest('hex'),workerSha256:createHash('sha256').update(await readFile(path.join(root,'dist/main/match-worker.cjs'))).digest('hex'),rendererSha256:hash.digest('hex'),lockSha256:createHash('sha256').update(await readFile(path.join(root,'package-lock.json'))).digest('hex')};
}
const save=()=>writeFile(output,JSON.stringify(report,null,2)+'\n');
async function seed(){
  const directory=await mkdtemp(path.join(tmpdir(),'nexlet-interaction-data-'));
  const db=new DatabaseSync(path.join(directory,'nexlet.sqlite'));
  db.exec('CREATE TABLE documents(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE clips(id TEXT PRIMARY KEY,hash TEXT UNIQUE NOT NULL,created INTEGER NOT NULL,favorite INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL);BEGIN');
  const doc=db.prepare('INSERT INTO documents VALUES (?,?)');
  doc.run('settings',JSON.stringify({language:'zh-CN',clipboardEnabled:false,hideOnBlur:false,autoCheckUpdates:false}));
  const commands=Object.fromEntries(Array.from({length:100},(_,i)=>['app:fixture-'+i,{aliases:['alias '+i]}]));
  doc.run('command-config',JSON.stringify({revision:1,commands,localEntries:[],layout:'grid'}));
  const insert=db.prepare('INSERT INTO clips VALUES (?,?,?,?,?)');
  for(let i=0;i<500;i++){const item={id:'clip-'+i,hash:'clip-'+i,kind:'text',text:('Synthetic clipboard '+i+' ').padEnd(32768,'x'),createdAt:1700000000000+i,favorite:false};insert.run(item.id,item.hash,item.createdAt,0,JSON.stringify(item));}
  db.exec('COMMIT');db.close();return directory;
}
async function rss(application){
  const pids=await application.evaluate(({app})=>app.getAppMetrics().map(item=>item.pid));
  const {stdout}=await exec('/bin/ps',['-o','rss=','-p',pids.join(',')]);
  return stdout.trim().split(/\s+/).reduce((sum,value)=>sum+Number(value),0)/1024;
}
async function run(label,round,warmup=false){
  const env={...process.env,NEXLET_TEST_MODE:'1',NEXLET_TEST_LOCALE:'zh-CN',NEXLET_USER_DATA:await seed()};delete env.ELECTRON_RUN_AS_NODE;
  const started=performance.now();const application=await electron.launch({args:[roots[label]],env,timeout:30000});
  try{
    const page=await application.firstWindow();
    await page.waitForFunction(()=>document.querySelector('.launcher-input')?.getBoundingClientRect().width>0,undefined,{polling:'raf'});
    const startupMs=performance.now()-started;
    await application.evaluate(async()=>{const n=globalThis.__nexlet;const end=Date.now()+15000;while(n.catalog.loading&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,20));if(n.catalog.loading)throw Error('Catalog timeout');});
    report.versions ||= await application.evaluate(()=>process.versions);
    const homeRssMiB=await rss(application);
    await application.evaluate(()=>{
      const n=globalThis.__nexlet;
      n.catalog.items=Array.from({length:1000},(_,i)=>({id:'app:fixture-'+i,name:'Fixture '+String(i).padStart(4,'0'),subtitle:'Synthetic application',kind:'app',keywords:[]}));
      n.store.set('plugins',[{enabled:true,directory:'/fixture',manifest:{id:'org.nexlet.benchmark',name:'Benchmark',version:'1.0.0',main:'index.html',features:Array.from({length:8},(_,i)=>({code:'rule-'+i,name:'Handler '+i,keywords:[],matches:[{type:'regex',pattern:'Fixture'}]}))}}]);
      n.main.webContents.send('host-change','state');
    });
    await page.waitForFunction(()=>document.querySelector('.launcher-footer')?.textContent.includes('1000'));
    const wake=[];
    for(let i=0;i<8;i++){
      await application.evaluate(()=>globalThis.__nexlet.main.hide());await delay(60);
      wake.push(await application.evaluate(async()=>{const start=performance.now();await globalThis.__nexlet.show();return performance.now()-start;}));
    }
    // Wait for state refreshes generated by show() before timing the search path.
    await delay(150);
    const search=[];
    for(let i=0;i<10;i++)search.push(await page.evaluate(async i=>{
      const requestId='benchmark-'+i,start=performance.now();let first;
      const off=window.nexlet.onSearchProgress?.(event=>{if(event.requestId===requestId)first??=performance.now()-start;});
      try{const result=await window.nexlet.call('search',{query:'Fixture '+String(i).padStart(2,'0'),from:'input',requestId});const full=performance.now()-start;return {firstMs:first??full,completeMs:full,results:result.results.length,matches:result.matches.length};}finally{off?.();}
    },i));
    const searchUi=[];
    for(let i=0;i<5;i++){
      await page.locator('.launcher-input').fill('');await delay(80);
      searchUi.push(await page.evaluate(i=>new Promise((resolve,reject)=>{
        const input=document.querySelector('.launcher-input'),start=performance.now(),query='Fixture '+String(i).padStart(2,'0');
        const deadline=setTimeout(()=>reject(Error('Search UI timeout')),15000);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,query);input.dispatchEvent(new Event('input',{bubbles:true}));
        const check=()=>{if(document.querySelector('.launcher-body [data-command-id="app:fixture-'+i*100+'"]')){clearTimeout(deadline);resolve(performance.now()-start);}else requestAnimationFrame(check);};requestAnimationFrame(check);
      }),i));
    }
    await page.locator('.launcher-input').fill('');await delay(100);
    const clipboardOpen=await page.evaluate(()=>new Promise((resolve,reject)=>{
      const start=performance.now();window.__longTasks=[];
      const observer=new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(entry=>entry.duration)));observer.observe({type:'longtask'});window.__longTaskObserver=observer;
      document.querySelector('[data-command-id="tool:clipboard"]').click();
      const deadline=setTimeout(()=>reject(Error('Clipboard UI timeout')),20000);
      const check=()=>{const rows=document.querySelectorAll('.clip-item');if(rows.length){clearTimeout(deadline);resolve({ms:performance.now()-start,rows:rows.length});}else requestAnimationFrame(check);};requestAnimationFrame(check);
    }));
    await delay(200);
    const clipboardRssMiB=await rss(application);
    const paged=await application.evaluate(()=>typeof globalThis.__nexlet.store.clipIndex==='function');
    const clipboardIpc=await page.evaluate(async paged=>{
      const start=performance.now();let bytes;
      if(paged){const index=await window.nexlet.call('clipIndex'),page=await window.nexlet.call('clipPage',{ids:index.ids.slice(0,40),revision:index.revision});bytes=new TextEncoder().encode(JSON.stringify(index)).length+new TextEncoder().encode(JSON.stringify(page)).length;}
      else bytes=new TextEncoder().encode(JSON.stringify(await window.nexlet.call('clips'))).length;
      return {bytes,ms:performance.now()-start};
    },paged);
    const scroll=await page.evaluate(()=>new Promise(resolve=>{
      const node=document.querySelector('.clipboard-list'),frames=[];let previous=performance.now(),step=0,peakRows=0;
      const frame=now=>{frames.push(now-previous);previous=now;peakRows=Math.max(peakRows,document.querySelectorAll('.clip-item').length);node.scrollTop=(node.scrollHeight-node.clientHeight)*(1-Math.cos(step/119*Math.PI*4))/2;
        if(++step<120)requestAnimationFrame(frame);else{window.__longTaskObserver.disconnect();resolve({frames,peakRows,longTasks:window.__longTasks});}};
      requestAnimationFrame(frame);
    }));
    await delay(100);
    const result={label,round,startupMs,wake,search,searchUi,clipboardOpen,clipboardIpc,homeRssMiB,clipboardRssMiB,scroll};
    if(!warmup){report.samples.push(result);await save();}
    console.log(JSON.stringify({label,round,warmup,startupMs:Math.round(startupMs),clipboardOpenMs:Math.round(clipboardOpen.ms),rows:clipboardOpen.rows}));
  }finally{await application.close();}
}
try{
  for(const label of ['before','after'])await run(label,-1,true);
  for(let round=0;round<runs;round++)for(const label of round%2?['after','before']:['before','after'])await run(label,round);
}catch(error){report.error=String(error.stack||error);process.exitCode=1;console.error(error);}
finally{await save();}
