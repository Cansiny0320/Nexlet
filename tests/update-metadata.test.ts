import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
// @ts-expect-error Build-time JavaScript helper is exercised directly.
import { prepareUpdateMetadata } from '../scripts/prepare-update-metadata.mjs';
const folders:string[]=[];
afterEach(async()=>{await Promise.all(folders.splice(0).map(folder=>rm(folder,{recursive:true,force:true})));});
async function fixture(){
 const folder=await mkdtemp(path.join(tmpdir(),'nexlet-updates-'));folders.push(folder);
 for(const arch of ['x64','arm64','win','linux-x64','linux-arm64']){
  const names=arch.startsWith('linux-')?[`Nexlet-0.2.3-Linux-${arch==='linux-x64'?'x86_64':'arm64'}.AppImage`,`Nexlet-0.2.3-Linux-${arch==='linux-x64'?'amd64':'arm64'}.deb`]:arch==='win'?['Nexlet-0.2.3-Windows-x64-Setup.exe']:[`Nexlet-0.2.3-macOS-${arch}.zip`,`Nexlet-0.2.3-macOS-${arch}.dmg`];
  const files=[];
  for(const name of names){const data=Buffer.from(name);await writeFile(path.join(folder,name),data);files.push({url:name,sha512:createHash('sha512').update(data).digest('base64'),size:data.length});}
  await writeFile(path.join(folder,arch==='win'?'latest.yml':arch==='linux-x64'?'latest-linux.yml':arch==='linux-arm64'?'latest-linux-arm64.yml':`latest-mac-${arch}.yml`),JSON.stringify({version:'0.2.3',files,path:files[0].url,sha512:files[0].sha512}));
 }
 return folder;
}
it('合并两种 Mac 架构且保留 Windows 安装版元数据',async()=>{
 const folder=await fixture();await prepareUpdateMetadata(folder,'0.2.3');
 const metadata=await readFile(path.join(folder,'latest-mac.yml'),'utf8');
 expect(metadata).toContain('macOS-arm64.zip');expect(metadata).toContain('macOS-x64.zip');
 expect(await readFile(path.join(folder,'latest.yml'),'utf8')).toContain('Setup.exe');
 await expect(readFile(path.join(folder,'latest-mac-arm64.yml'))).rejects.toThrow();
});
it('拒绝版本不符或资产损坏，不能发布错误的更新清单',async()=>{
 const folder=await fixture();await expect(prepareUpdateMetadata(folder,'0.2.4')).rejects.toThrow();
 await writeFile(path.join(folder,'Nexlet-0.2.3-macOS-arm64.zip'),'corrupted');
 await expect(prepareUpdateMetadata(folder,'0.2.3')).rejects.toThrow('checksum');
 await expect(readFile(path.join(folder,'latest-mac.yml'))).rejects.toThrow();
});

it('Linux 两种架构独立校验，拒绝损坏或混用的 Linux 更新包',async()=>{
 const folder=await fixture();await writeFile(path.join(folder,'Nexlet-0.2.3-Linux-arm64.AppImage'),'corrupted');
 await expect(prepareUpdateMetadata(folder,'0.2.3')).rejects.toThrow('checksum');
 await expect(readFile(path.join(folder,'latest-mac.yml'))).rejects.toThrow();
});
