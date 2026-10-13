import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import sharp from 'sharp';

test('SDK capabilities operate through the sandbox bridge and clean up with their owner', async () => {
  test.setTimeout(120000);
  const directory = await mkdtemp(path.join(tmpdir(), 'nexlet-sdk-')), plugin = path.join(directory, 'plugin'), id = 'org.nexlet.sdk-fixture';
  await mkdir(plugin);
  const permissions = ['backend', 'files', 'process', 'browser', 'screen', 'windows', 'media', 'ai', 'services', 'tools', 'mcp', 'input.simulate'];
  await writeFile(path.join(plugin, 'plugin.json'), JSON.stringify({ id, name: 'SDK fixture', version: '1.0.0', apiVersion: 1, main: 'index.html', backend: 'backend.cjs', permissions, features: [{ code: 'test', name: 'SDK fixture', keywords: ['fixture'] }] }));
  await writeFile(path.join(plugin, 'index.html'), '<!doctype html><html><body>SDK fixture<input id="native-input"><script src="main.js"></script></body></html>');
  await writeFile(path.join(plugin, 'child.html'), '<!doctype html><html><body>Child<script src="child.js"></script></body></html>');
  await writeFile(path.join(plugin, 'child.js'), 'nexlet.window.onMessage(e=>nexlet.window.send({echo:e.message}));');
  await writeFile(path.join(plugin, 'main.js'), 'window.events=[];nexlet.tasks.onProgress(e=>events.push(e));nexlet.window.onMessage(e=>events.push(e));nexlet.search.onChange(e=>events.push(e));nexlet.search.onSelect(e=>events.push(e));nexlet.ai.onChunk(e=>events.push(e));');
  await writeFile(path.join(plugin, 'backend.cjs'), `const fs=require('node:fs/promises');const path=require('node:path');exports.handlers={echo:async(args,ctx)=>{ctx.emit('progress');return {args,pid:process.pid}},crash:()=>process.exit(7),wait:()=>new Promise(()=>{}),scheduled:async(args,ctx)=>{await fs.writeFile(path.join(ctx.dataDirectory,'scheduled.txt'),'done');return true},add:({a,b})=>a+b};`);
  let version: string | null = null, syncValue: unknown = null;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    if (req.url === '/page') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><title>Fixture</title></head><body><input id="text"><input type="file" id="file"><button onclick="document.title=\'Clicked\'">go</button></body></html>'); return; }
    if (req.url === '/download') { res.setHeader('Content-Disposition', 'attachment; filename="fixture.txt"'); res.end('downloaded'); return; }
    if (req.url === '/v1/chat/completions' && body.stream) { res.setHeader('Content-Type', 'text/event-stream'); res.write('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'); if(body.model!=='slow')res.end('data: [DONE]\n\n'); return; }
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/models') res.end(JSON.stringify({ data: [{ id: 'fixture' }] }));
    else if (req.url === '/v1/chat/completions') res.end(JSON.stringify({ choices: [{ message: { content: 'hello' } }] }));
    else if (req.url === '/service/account') res.end(JSON.stringify({ user: { id: 'fixture-user' } }));
    else if (req.url === '/service/auth/start') res.end(JSON.stringify({ url: 'https://login.example/authorize?state=fixture', sessionId: 'fixture-session' }));
    else if (req.url === '/service/auth/status') res.end(JSON.stringify({ status: 'complete', token: 'fixture-login-token' }));
    else if (req.url?.startsWith('/service/license')) res.end(JSON.stringify({ active: true }));
    else if (req.url === '/service/checkout') res.end(JSON.stringify({ url: 'https://checkout.example/fixture' }));
    else if (req.url === '/service/sync/state') {
      if (req.method === 'POST') { if (body.expectedVersion !== version) { res.statusCode = 409; res.end('{}'); return; } version = String(Number(version ?? 0) + 1); syncValue = body.value; }
      res.end(JSON.stringify({ value: syncValue, version }));
    } else { res.statusCode = 404; res.end('{}'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env: Record<string,string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string,string]=>entry[1]!==undefined)), NEXLET_TEST_MODE: '1', NEXLET_USER_DATA: path.join(directory, 'data') }; delete env.ELECTRON_RUN_AS_NODE;
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({ args: [path.resolve('.')], env });
    const page = await app.firstWindow();
    await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
    await app.evaluate(({ dialog }, plugin) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [plugin] }); }, plugin);
    await page.evaluate(() => window.nexlet.call('pluginInstall', { development: true }));
    const launch = () => page.evaluate(id => window.nexlet.call('launch', { id: `plugin:${id}:test` }), id);
    await launch();
    const read = (script: string) => app!.evaluate(async (_, { id, script }) => {
      const session = (globalThis as any).__nexlet.plugins.runtime.sessions.get(id); await session.queue;
      return session.view.webContents.executeJavaScript(script);
    }, { id, script });
    expect(await read('[typeof require,typeof process]')).toEqual(['undefined', 'undefined']);
    expect(await read('nexlet.clipboard.readText().then(()=>false,e=>e.message.includes("clipboard.read"))')).toBe(true);
    expect(await read('nexlet.system.info().then(x=>x.platform)')).toBe(process.platform);
    expect(await read('nexlet.screen.displays().then(x=>x.length)')).toBeGreaterThan(0);
    expect(await read('nexlet.screen.cursor().then(x=>Number.isFinite(x.x)&&Number.isFinite(x.y))')).toBe(true);
    const permissionsStatus = await app.evaluate(({ systemPreferences }) => ({ screen: process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'unknown', input: process.platform === 'darwin' ? systemPreferences.isTrustedAccessibilityClient(false) : false }));
    console.log('Native SDK permission status:', JSON.stringify(permissionsStatus));
    if (process.env.NEXLET_SDK_NATIVE === '1' && permissionsStatus.screen === 'granted') {
      await expect.poll(() => read('nexlet.screen.sources().then(x=>x.some(s=>s.id.startsWith("screen:")))')).toBe(true);
      expect(await read('nexlet.screen.sources().then(x=>nexlet.screen.capture({sourceId:x.find(s=>s.id.startsWith("screen:")).id,width:320,height:200})).then(x=>x.data.byteLength)')).toBeGreaterThan(100);
      const overlayPromise = app.waitForEvent('window');
      await read('window.selectedRegion=nexlet.screen.select({id:"region",timeoutMs:15000}).catch(e=>({error:e.message}));true');
      const overlay = await overlayPromise; await overlay.getByText('拖动选择区域 · Esc 取消').waitFor();
      await overlay.mouse.move(100, 100); await overlay.mouse.down(); await overlay.mouse.move(160, 140); await overlay.mouse.up();
      const region = await read('selectedRegion.then(x=>({width:x.region.width,height:x.region.height,bytes:x.data.byteLength}))');
      expect(region).toMatchObject({ width: 60, height: 40 }); expect(region.bytes).toBeGreaterThan(100);
    }
    if (process.env.NEXLET_SDK_NATIVE === '1' && permissionsStatus.input && process.platform === 'darwin') {
      await read('nexlet.window.show().then(()=>{document.querySelector("#native-input").focus()})');
      await read('nexlet.input.key({code:0})');
      await expect.poll(() => read('document.querySelector("#native-input").value')).toBe('a');
      expect(await read('nexlet.screen.cursor().then(point=>nexlet.input.mouse({action:"move",...point}))')).toBe(true);
    }
    expect(await read('nexlet.database.put({id:"doc",value:{n:1}}).then(x=>{window.rev=x.rev;return x.value.n})')).toBe(1);
    expect(await read('nexlet.database.put({id:"doc",value:2}).then(()=>false,e=>e.message.includes("conflict"))')).toBe(true);
    expect(await read('nexlet.database.putAttachment("doc",rev,"test","application/octet-stream",new Uint8Array([1,255])).then(()=>nexlet.database.getAttachment("doc","test")).then(x=>Array.from(x.data))')).toEqual([1, 255]);
    const echo = await read('nexlet.backend.call({id:"echo",method:"echo",args:{ok:true}})'); expect(echo.args).toEqual({ ok: true });
    expect(await read('events.some(e=>e.id==="echo"&&e.value==="progress")')).toBe(true);
    await read('window.cancelled=nexlet.backend.call({id:"slow",method:"wait"}).then(()=>"success",e=>e.message);true');
    expect(await read('nexlet.tasks.cancel("slow")')).toBe(true);
    expect(await read('cancelled')).toContain('取消');
    expect((await read('nexlet.backend.call({id:"after-cancel",method:"echo",args:{ok:true}})')).args.ok).toBe(true);
    expect(await read('nexlet.backend.call({id:"crash",method:"crash"}).then(()=>false,e=>e.message.includes("退出"))')).toBe(true);
    expect((await read('nexlet.backend.call({id:"after-crash",method:"echo",args:{ok:true}})')).args.ok).toBe(true);
    const file = path.join(directory, 'data.txt');
    expect(await read(`nexlet.files.write(${JSON.stringify(file)},new Uint8Array([65,66])).then(()=>nexlet.files.read(${JSON.stringify(file)})).then(x=>Array.from(x))`)).toEqual([65, 66]);
    expect(await read(`nexlet.files.write(${JSON.stringify(file)},new Uint8Array([1])).then(()=>false,()=>true)`)).toBe(true);
    expect(await read(`nexlet.process.run({id:"node",executable:${JSON.stringify(process.execPath)},args:["-e","process.stdout.write('node-ok')"]}).then(x=>x.stdout)`)).toBe('node-ok');
    const child = await read('nexlet.window.create({entry:"child.html",visible:false})');
    await read(`nexlet.window.send({hello:1},${JSON.stringify(child)})`);
    await expect.poll(() => read('events.some(e=>e.message?.echo?.hello===1)')).toBe(true);
    await read(`nexlet.window.close(${JSON.stringify(child)})`);
    await read('nexlet.commands.set([{code:"dynamic",name:"Dynamic fixture",keywords:["dynamic"]}])');
    expect(await page.evaluate(() => window.nexlet.call<any>('state').then(state => state.commands.some((c: any) => c.feature === 'dynamic')))).toBe(true);
    await read('nexlet.search.set({text:"initial",placeholder:"Fixture query"}).then(()=>nexlet.search.results([{id:"row",title:"Fixture result"}]))');
    await expect(page.getByLabel('插件搜索', { exact: true })).toHaveValue('initial');
    await page.getByLabel('插件搜索', { exact: true }).fill('changed'); await page.getByText('Fixture result', { exact: true }).click();
    expect(await read('events.some(e=>e.text==="changed")&&events.some(e=>e.id==="row")')).toBe(true);
    await read('nexlet.search.results([])');
    const browser = await read('nexlet.browser.create()'); let job = 0;
    const browse = (action: unknown) => read(`nexlet.browser.perform(${JSON.stringify({ browser, id: `browser-${++job}`, action })})`);
    expect((await browse({ type: 'navigate', url: baseUrl + '/page' })).title).toBe('Fixture');
    expect(await browse({ type: 'evaluate', script: '[typeof nexlet,typeof require,typeof process]' })).toEqual(['undefined', 'undefined', 'undefined']);
    await browse({ type: 'type', selector: '#text', text: 'browser input' });
    expect(await browse({ type: 'evaluate', script: 'document.querySelector("#text").value' })).toBe('browser input');
    await browse({ type: 'files', selector: '#file', paths: [file] });
    expect(await browse({ type: 'evaluate', script: 'document.querySelector("#file").files[0].name' })).toBe('data.txt');
    await browse({ type: 'click', selector: 'button' }); expect((await browse({ type: 'info' })).title).toBe('Clicked');
    await browse({ type: 'setCookie', cookie: { url: baseUrl, name: 'fixture', value: 'yes' } });
    expect((await browse({ type: 'cookies', url: baseUrl })).some((c: any) => c.name === 'fixture')).toBe(true);
    expect(await read(`nexlet.browser.perform({browser:${JSON.stringify(browser)},id:"png",action:{type:"screenshot"}}).then(x=>x.byteLength)`)).toBeGreaterThan(100);
    expect(await read(`nexlet.browser.perform({browser:${JSON.stringify(browser)},id:"pdf",action:{type:"pdf"}}).then(x=>x.byteLength)`)).toBeGreaterThan(100);
    const download = path.join(directory, 'download.txt'); await browse({ type: 'download', url: baseUrl + '/download', path: download }); expect(await readFile(download, 'utf8')).toBe('downloaded');
    expect(await read(`nexlet.browser.perform({browser:${JSON.stringify(browser)},id:"browser-timeout",timeoutMs:50,action:{type:"wait",selector:"#missing"}}).then(()=>false,e=>e.message.includes("超时"))`)).toBe(true);
    expect(await read(`nexlet.browser.close(${JSON.stringify(browser)}).then(()=>false,e=>e.message.includes("句柄"))`)).toBe(true);
    const png = await sharp({ create: { width: 10, height: 8, channels: 3, background: 'red' } }).png().toBuffer();
    const image = await read(`nexlet.media.image({id:"image",data:new Uint8Array(${JSON.stringify([...png])}),operations:[{op:"resize",args:[5,4]}]}).then(x=>({width:x.info.width,height:x.info.height,bytes:x.data.byteLength}))`);
    expect(image.width).toBe(5); expect(image.height).toBe(4); expect(image.bytes).toBeGreaterThan(10);
    const wav = path.join(directory, 'sound.wav');
    expect(await read(`nexlet.media.ffmpeg({id:"ffmpeg",args:${JSON.stringify(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.1', '-y', wav])}}).then(x=>x.code)`)).toBe(0); expect((await readFile(wav)).length).toBeGreaterThan(100);
    await read(`nexlet.ai.configure({baseUrl:${JSON.stringify(baseUrl + '/v1')},apiKey:"fixture"})`);
    expect(await read('nexlet.ai.models({id:"models"}).then(x=>x[0].id)')).toBe('fixture');
    expect(await read('nexlet.ai.chat({id:"chat",stream:true,request:{model:"fixture",messages:[{role:"user",content:"hi"}]}}).then(x=>x.content)')).toBe('hello');
    await read('window.aiCancelled=nexlet.ai.chat({id:"slow-ai",stream:true,request:{model:"slow",messages:[{role:"user",content:"hi"}]}}).then(()=>"success",e=>e.message);true');
    await expect.poll(()=>read('events.some(e=>e.id==="slow-ai")')).toBe(true);
    expect(await read('nexlet.tasks.cancel("slow-ai")')).toBe(true); expect(await read('aiCancelled')).toContain('取消');
    await read(`nexlet.services.configure({baseUrl:${JSON.stringify(baseUrl + '/service')}})`);
    expect(await read('nexlet.services.account({id:"account"}).then(x=>x.user.id)')).toBe('fixture-user');
    expect(await read('nexlet.services.login({id:"login"}).then(x=>x.url)')).toBe('https://login.example/authorize?state=fixture');
    expect(await read('nexlet.services.loginStatus({id:"login-status",sessionId:"fixture-session"}).then(x=>({status:x.status,tokenVisible:"token" in x}))')).toEqual({status:'complete',tokenVisible:false});
    expect(await read('nexlet.services.license({id:"license",product:"fixture"}).then(x=>x.active)')).toBe(true);
    expect(await read('nexlet.services.checkout({id:"checkout",product:"fixture",idempotencyKey:"checkout-fixture"}).then(x=>x.url)')).toBe('https://checkout.example/fixture');
    expect(await read('nexlet.services.syncPut({id:"sync",key:"state",expectedVersion:null,value:{n:1},idempotencyKey:"first"}).then(x=>x.version)')).toBe('1');
    expect(await read('nexlet.services.syncPut({id:"conflict",key:"state",expectedVersion:null,value:2,idempotencyKey:"stale"}).then(()=>false,e=>e.message.includes("409"))')).toBe(true);
    expect(await read('nexlet.services.syncGet({id:"sync-read",key:"state"})')).toEqual({version:'1',value:{n:1}});
    await read('nexlet.tools.register({name:"add",description:"Add numbers",method:"add",inputSchema:{type:"object",properties:{a:{type:"number"},b:{type:"number"}},required:["a","b"],additionalProperties:false}})');
    expect(await read('nexlet.tools.call({id:"tool",name:"add",args:{a:2,b:3}})')).toBe(5);
    expect(await read('nexlet.tools.call({id:"bad-tool",name:"add",args:{a:"wrong"}}).then(()=>false,e=>e.message.includes("schema"))')).toBe(true);
    const mcp = await read('nexlet.mcp.start()');
    const response = await fetch(mcp.url, { method: 'POST', headers: { authorization: 'Bearer ' + mcp.token, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add', arguments: { a: 3, b: 4 } } }) });
    expect((await response.json()).result.content[0].text).toBe('7');
    await read('nexlet.schedules.set({id:"scheduled",method:"scheduled",at:Date.now()+200})');
    await page.evaluate(() => window.nexlet.call('window', { action: 'exitPlugin' }));
    await expect.poll(async () => readFile(path.join(directory, 'data/plugin-backends', id, 'scheduled.txt'), 'utf8').catch(() => '')).toBe('done');
    await expect(fetch(mcp.url)).rejects.toThrow();
    await launch(); expect(await read('nexlet.database.get("doc").then(x=>x.value.n)')).toBe(1);
    expect(await read(`nexlet.browser.close(${JSON.stringify(browser)}).then(()=>false,e=>e.message.includes("句柄"))`)).toBe(true);
    await page.evaluate(id => window.nexlet.call('pluginRemove', { id, deleteData: true }), id);
    expect(await app.evaluate(() => (globalThis as any).__nexlet.plugins.sdk.tasks.size)).toBe(0);
  } finally { await app?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
});
