import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileBrowser } from '../src/main/file-browser';

let root:string,browser:FileBrowser,grants:Map<number,Set<string>>;
beforeEach(async()=>{
  root=await mkdtemp(path.join(os.tmpdir(),'nexlet-browser-'));
  await mkdir(path.join(root,'child'));await writeFile(path.join(root,'report.pdf'),'example');
  grants=new Map([[1,new Set([root])]]);browser=new FileBrowser(owner=>grants.get(owner));
});
afterEach(async()=>{browser.reset();await rm(root,{recursive:true,force:true});});

describe('authorized file browsing',()=>{
  it('denies arbitrary paths and grants only this window its directory children and parents',async()=>{
    await expect(browser.browse(2,root)).rejects.toThrow('当前');
    await expect(browser.info(1,path.join(root,'report.pdf'))).rejects.toThrow('当前');
    const page=await browser.browse(1,root);
    expect(page.items.map(item=>item.name)).toEqual(['child','report.pdf']);
    expect(page.parent).toBe(path.dirname(root));
    expect(grants.get(1)?.has(page.parent!)).toBe(true);
    await expect(browser.info(2,path.join(root,'report.pdf'))).rejects.toThrow('当前');
    expect(await browser.info(1,path.join(root,'report.pdf'))).toMatchObject({size:7,directory:false,name:'report.pdf',created:expect.any(String),modified:expect.any(String)});
  });
  it('paginates without truncation and filters only direct child names',async()=>{
    await Promise.all(Array.from({length:205},(_,i)=>writeFile(path.join(root,`entry-${i}.txt`),'')));
    await writeFile(path.join(root,'child','nested.txt'),'');
    const seen=new Set<string>();let page=await browser.browse(1,root);
    expect(page.items.length).toBeLessThanOrEqual(100);
    do{for(const item of page.items)seen.add(item.name);if(!page.cursor)break;page=await browser.browse(1,root,'',page.cursor);}while(true);
    expect(seen.size).toBe(207);expect(seen.has('nested.txt')).toBe(false);
    expect((await browser.browse(1,root,'REPORT')).items.map(i=>i.name)).toEqual(['report.pdf']);
  });
  it('rejects stale cursors and stops after search grants are replaced',async()=>{
    await Promise.all(Array.from({length:101},(_,i)=>writeFile(path.join(root,`entry-${i}`),'')));
    const page=await browser.browse(1,root);await browser.browse(1,root,'report');
    await expect(browser.browse(1,root,'',page.cursor!)).rejects.toThrow('过期');
    grants.set(1,new Set());
    await expect(browser.info(1,path.join(root,'report.pdf'))).rejects.toThrow('当前');
  });
  it('reports deleted files and prevents a file being browsed as a directory',async()=>{
    await browser.browse(1,root);const file=path.join(root,'report.pdf');
    await expect(browser.browse(1,file)).rejects.toThrow('文件夹');
    await rm(file);await expect(browser.info(1,file)).rejects.toThrow('不存在');
  });
  it('invalidates pagination when the owner closes',async()=>{
    await Promise.all(Array.from({length:101},(_,i)=>writeFile(path.join(root,`entry-${i}`),'')));
    const page=await browser.browse(1,root);browser.forget(1);
    await expect(browser.browse(1,root,'',page.cursor!)).rejects.toThrow('过期');
  });
  it('does not grant children when a pending read is superseded or the owner is forgotten',async()=>{
    const pending=browser.browse(1,root);grants.set(1,new Set([root]));
    await expect(pending).rejects.toThrow('过期');expect(grants.get(1)?.has(path.join(root,'report.pdf'))).toBe(false);
    const closing=browser.browse(1,root);browser.forget(1);
    await expect(closing).rejects.toThrow('过期');expect(grants.get(1)?.has(path.join(root,'report.pdf'))).toBe(false);
  });
});
