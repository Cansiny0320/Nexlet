import { describe, expect, it } from 'vitest';
import { spotlightQuery } from '../src/shared/spotlight';

describe('Spotlight 文件名查询',()=>{
  it('中文、多关键词和扩展名同时匹配',()=>{
    expect(spotlightQuery('项目 报告 ext:PDF')).toBe('(kMDItemFSName == "*项目*"cd) && (kMDItemFSName == "*报告*"cd) && (kMDItemFSName == "*.PDF"cd)');
  });
  it('支持通配符和双引号短语',()=>{
    expect(spotlightQuery('"年度 报告" *.pdf')).toContain('"*年度 报告*"cd');
    expect(spotlightQuery('报告?.pdf')).toBe('(kMDItemFSName == "报告?.pdf"cd)');
  });
  it('引号、反斜线和表达式字符作为文件名内容转义',()=>{
    expect(spotlightQuery(String.raw`"a\"b\\c"`)).toBe(String.raw`(kMDItemFSName == "*a\"b\\c*"cd)`);
    expect(spotlightQuery('a||b')).toBe('(kMDItemFSName == "*a||b*"cd)');
    expect(spotlightQuery("O'Reilly")).toContain("*O'Reilly*");
  });
  it('拒绝未支持的过滤语法及无效输入',()=>{
    for(const query of ['ext:', 'ext:pdf;txt', 'size:>1mb', '"未闭合', 'a\0b', 'a\nb', 'x'.repeat(1025),'  '])expect(()=>spotlightQuery(query)).toThrow();
  });
});
