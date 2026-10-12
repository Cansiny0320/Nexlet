import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test.skip(process.platform!=='darwin','macOS Spotlight 集成测试');
test.describe.configure({mode:'serial'});
let app:ElectronApplication,page:Page,folder:string;
const errors:string[]=[];
async function call(action:string,payload?:unknown){return page.evaluate(({action,payload})=>(window as any).nexlet.call(action,payload),{action,payload});}
test.beforeAll(async()=>{
  folder=await mkdtemp(path.join(tmpdir(),'nexlet-spotlight-'));
  const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),NEXLET_TEST_MODE:'1',NEXLET_USER_DATA:folder};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({args:[process.cwd()],env});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
  await call('settings',{clipboardEnabled:false});
  await page.getByLabel('搜索功能、应用或快捷方式').fill('文件搜索');await page.getByRole('button',{name:'文件搜索',exact:true}).first().click();
});
test.afterAll(async()=>{await app?.close();if(folder)await rm(folder,{recursive:true,force:true});});

test('范围设置与真实 Spotlight 多关键词、扩展名查询',async()=>{
  await expect(page.getByText('Spotlight · 系统索引',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'搜索范围设置',exact:true}).click();
  await expect(page.getByText('Spotlight 文件搜索',{exact:true})).toBeVisible();
  await app.evaluate(({dialog})=>{dialog.showOpenDialog=(async()=>({canceled:false,filePaths:['/System/Applications']})) as any;});
  await page.getByRole('button',{name:'添加文件搜索目录',exact:true}).click();
  await expect.poll(async()=>((await call('state')) as any).settings.fileSearchPaths).toEqual(['/System/Applications']);
  await app.evaluate(()=>{(globalThis as any).__nexlet.main.webContents.send('host-change','navigate:filesearch');});
  const input=page.getByLabel('Spotlight 文件搜索');await input.fill('Calc ulator ext:app');
  const row=page.getByRole('option').filter({hasText:'Calculator.app'});await expect(row).toBeVisible();
  await expect(row).toContainText('/System/Applications');await expect(page.locator('.file-search-footer')).toContainText('1 个搜索目录');
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.screenshot({path:'test-results/filesearch-mac.png'});
});

test('真实结果支持打开、Finder 定位、复制路径与键盘选择',async()=>{
  await app.evaluate(({shell})=>{
    const state=globalThis as any;state.__fileActions=[];state.__openPath=shell.openPath;state.__reveal=shell.showItemInFolder;
    shell.openPath=async file=>{state.__fileActions.push(['open',file]);return '';};shell.showItemInFolder=file=>{state.__fileActions.push(['reveal',file]);};
  });
  try{
    await page.getByRole('option').filter({hasText:'Calculator.app'}).dblclick();
    await page.getByRole('button',{name:'打开所在文件夹',exact:true}).click();
    expect(await app.evaluate(()=>(globalThis as any).__fileActions)).toEqual([['open','/System/Applications/Calculator.app'],['reveal','/System/Applications/Calculator.app']]);
    await app.evaluate(async({clipboard,ClipboardItem})=>{
      const saved=[];
      for(const item of await clipboard.read()){
        const values:Record<string,any>={};
        for(const type of item.types)if(['text/plain','text/html','image/png','text/rtf','electron application/bookmark'].includes(type))values[type]=await item.getType(type);
        if(Object.keys(values).length)saved.push(new ClipboardItem(values));
      }
      (globalThis as any).__spotlightSavedClipboard=saved;
      (globalThis as any).__spotlightSavedFiles=await (globalThis as any).__nexlet.platform.readFiles();
    });
    try{
      await page.getByRole('button',{name:'复制文件路径',exact:true}).click();
      expect(await app.evaluate(async({clipboard})=>await clipboard.readText())).toBe('/System/Applications/Calculator.app');
    }finally{await app.evaluate(async({clipboard})=>{const saved=(globalThis as any).__spotlightSavedClipboard,files=(globalThis as any).__spotlightSavedFiles;if(files?.length)await (globalThis as any).__nexlet.platform.writeFiles(files);else if(saved.length)await clipboard.write(saved);else clipboard.clear();});}
    await page.getByLabel('Spotlight 文件搜索').fill('ext:app');
    await expect.poll(()=>page.getByRole('option').count()).toBeGreaterThan(1);
    await page.getByRole('option').first().click();
    await page.getByLabel('Spotlight 文件搜索').press('ArrowDown');await expect(page.getByRole('option').nth(1)).toHaveAttribute('aria-selected','true');
    await page.getByLabel('Spotlight 文件搜索').press('Enter');
    await expect.poll(()=>app.evaluate(()=>(globalThis as any).__fileActions.length)).toBe(3);
    await expect(call('fileAction',{action:'open',path:'/etc/passwd'})).rejects.toThrow('当前搜索结果');
  }finally{await app.evaluate(({shell})=>{shell.openPath=(globalThis as any).__openPath;shell.showItemInFolder=(globalThis as any).__reveal;});}
});

test('清空、无结果和范围变更后的结果刷新',async()=>{
  const input=page.getByLabel('Spotlight 文件搜索');await input.fill('nexlet-file-search-missing-7f83a19');
  await expect(page.getByText('没有找到相关文件；尚未被 Spotlight 索引或被排除的文件可能无法找到')).toBeVisible();
  await input.fill('');await expect(page.getByText('输入文件名开始搜索，支持多关键词、*.pdf 和 ext:pdf')).toBeVisible();
  await input.fill('Calculator');await expect(page.getByRole('option').filter({hasText:'Calculator.app'})).toBeVisible();
  await call('settings',{fileSearchPaths:['/System/Applications/Utilities']});
  await expect(page.getByRole('option')).toHaveCount(0);await expect(page.getByText('没有找到相关文件；尚未被 Spotlight 索引或被排除的文件可能无法找到')).toBeVisible();
  await expect(call('fileAction',{action:'open',path:'/System/Applications/Calculator.app'})).rejects.toThrow('当前搜索结果');
  expect(errors).toEqual([]);
});
