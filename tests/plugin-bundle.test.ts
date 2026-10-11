import { describe,it,expect } from 'vitest';
import AdmZip from 'adm-zip';
import { readPluginZip } from '../src/main/plugin-bundle';

const config={id:'test.example',name:'示例',version:'1.0.0',apiVersion:1,main:'index.html',permissions:[],features:[{code:'hello',name:'你好',keywords:['hello']}]};
function zip(extra?: (zip: AdmZip)=>void) {const z=new AdmZip();z.addFile('plugin.json',Buffer.from(JSON.stringify(config)));z.addFile('index.html',Buffer.from('<h1>test</h1>'));extra?.(z);return z.toBuffer();}
describe('插件包安装验证',()=>{
  it('读取有效包',()=>expect(readPluginZip(zip()).manifest.id).toBe('test.example'));
  it('拒绝跨平台大小写重复资源',()=>expect(()=>readPluginZip(zip(z=>{z.addFile('MAIN.js',Buffer.from('1'));z.addFile('main.js',Buffer.from('2'));}))).toThrow('重复'));
  it('拒绝缺失入口',()=>{const z=new AdmZip();z.addFile('plugin.json',Buffer.from(JSON.stringify(config)));expect(()=>readPluginZip(z.toBuffer())).toThrow('入口');});
  it('拒绝缺失 manifest',()=>expect(()=>readPluginZip(new AdmZip().toBuffer())).toThrow('plugin.json'));
});
