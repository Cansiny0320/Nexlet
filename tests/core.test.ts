import { describe, expect, it } from 'vitest';
import { calculate } from '../src/shared/calculator';
import { searchCommands } from '../src/shared/search';
import { validateManifest, safeEntryPath } from '../src/shared/plugin-validation';
import type { Command } from '../src/shared/types';

describe('计算稿纸', () => {
  it.each([['128*3', '384'], ['384+256', '640'], ['0.1+0.2', '0.3'], ['(12+8)/4', '5'], ['2^3^2', '512'], ['-2^2', '-4'], ['200*10%', '20'], ['sqrt(81)', '9'], ['1÷4', '0.25'], ['2×3', '6']])('%s = %s', (input, result) => expect(calculate(input)).toEqual({ result }));
  it.each(['1/0', 'process.exit()', '2^100000000', 'sqrt(-1)', '1+', 'import("fs")', '('.repeat(50) + '1' + ')'.repeat(50)])('安全地拒绝 %s', input => expect(calculate(input).error).toBeTruthy());
  it('空白行不显示错误', () => expect(calculate('  ')).toEqual({ result: '' }));
});
describe('统一搜索', () => {
  const items: Command[] = [
    { id:'1', name:'飞书', subtitle:'开始菜单快捷方式', kind:'shortcut', keywords:[] },
    { id:'2', name:'剪贴板', subtitle:'', kind:'tool', keywords:['clipboard'] },
    { id:'3', name:'File Explorer', subtitle:'', kind:'app', keywords:[] }
  ];
  it.each(['飞书', 'feishu', 'fs'])('找到中文快捷方式 %s', q => expect(searchCommands(items,q)[0]?.id).toBe('1'));
  it('英文搜索和关键字', () => expect(searchCommands(items,'CLIP')[0]?.id).toBe('2'));
  it('没有匹配返回空列表', () => expect(searchCommands(items,'不存在的工具')).toEqual([]));
});
describe('插件边界', () => {
  const manifest = { id:'example.hello', name:'示例', version:'1.0.0', apiVersion:1, main:'index.html', description:'', permissions:[], features:[{code:'hello',name:'你好',keywords:['hello']}] };
  it('接受独立插件', () => expect(validateManifest(manifest).id).toBe('example.hello'));
  it.each(['../outside.html','/etc/passwd','C:\\outside.html','a/../../outside.html','a\\..\\..\\bad','%2e%2e/x'])('拒绝路径 %s', main => expect(() => validateManifest({...manifest,main})).toThrow());
  it('拒绝未知权限', () => expect(() => validateManifest({...manifest,permissions:['shell.exec']})).toThrow());
  it('拒绝不兼容 API', () => expect(() => validateManifest({...manifest,apiVersion:2})).toThrow());
  it('拒绝重复功能码', () => expect(() => validateManifest({...manifest,features:[manifest.features[0],manifest.features[0]]})).toThrow());
  it('合法嵌套资源路径', () => expect(safeEntryPath('assets/icon.png')).toBe('assets/icon.png'));
});
