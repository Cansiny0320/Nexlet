import { afterEach, describe, expect, it } from 'vitest';
import { ContentMatcher } from '../src/main/content-matcher';
import { validateManifest } from '../src/shared/plugin-validation';
import type { Command } from '../src/shared/types';
import type { LaunchInput } from '../src/shared/launch';

const manifest = { id:'org.nexlet.fixture',name:'测试',version:'1.0.0',apiVersion:1,main:'index.html',permissions:[],features:[{code:'note',name:'便笺',keywords:['note']}] };
const text = (value:string):LaunchInput => ({ id:'input-1',type:'text',text:value,from:'input' });
const plugin = (id:string,matches:Command['matches'],name=id):Command => ({id,kind:'plugin',name,subtitle:'测试插件',keywords:[],pluginId:'org.nexlet.fixture',feature:id,matches});
const matchers:ContentMatcher[]=[];
function matcher(){const value=new ContentMatcher();matchers.push(value);return value;}
afterEach(()=>{for(const value of matchers.splice(0))value.close();});

describe('内容匹配合同',()=>{
  it('旧 manifest 不变，新规则经过校验并保留',()=>{
    expect(validateManifest(manifest).features[0]).toEqual(manifest.features[0]);
    const feature={...manifest.features[0],matches:[{type:'files',extensions:['JSON'],minCount:1,maxCount:3}]};
    expect(validateManifest({...manifest,features:[feature]}).features[0].matches).toEqual([{type:'files',extensions:['json'],minCount:1,maxCount:3}]);
  });
  it('拒绝非法正则、未知类型、倒置范围与过多规则',()=>{
    for(const matches of [[{type:'regex',pattern:'('}],[{type:'regex',pattern:'.*',flags:'g'}],[{type:'fs'}],[{type:'text',minLength:5,maxLength:1}],Array(11).fill({type:'image'})]){
      expect(()=>validateManifest({...manifest,features:[{...manifest.features[0],matches}]})).toThrow();
    }
  });
  it('关键词优先且与内容命中去重，内置匹配走同一结果合同',async()=>{
    const result=await matcher().search(1,[plugin('note',[{type:'text'}],'便笺')],text('便笺'),'便笺',[]);
    expect(result.results.map(c=>c.id)).toEqual(['note']);
    expect(result.matches.some(c=>c.id==='note')).toBe(false);
    const calc=await matcher().search(1,[],text('128*3'),'128*3',[]);
    expect(calc.matches.find(c=>c.id==='match:calc')?.payload).toBe('128*3');
    expect(calc.matches.find(c=>c.id==='match:calc')?.inputId).toBe('input-1');
  });
  it('所有文件均须满足类型/扩展名和数量，图片与空输入不混用',async()=>{
    const commands=[plugin('files',[{type:'files',extensions:['json'],fileType:'file',minCount:2,maxCount:3}]),plugin('image',[{type:'image'}]),plugin('text',[{type:'text',minLength:1}])];
    const files:LaunchInput={id:'files',type:'files',from:'drop',files:[{id:'a',name:'a.JSON',path:'/a.JSON',size:1,isDirectory:false},{id:'b',name:'b.json',path:'/b.json',size:1,isDirectory:false}]};
    expect((await matcher().search(1,commands,files,'',[])).matches.map(c=>c.id)).toContain('files');
    files.files[1].name='b.txt';
    expect((await matcher().search(1,commands,files,'',[])).matches.map(c=>c.id)).not.toContain('files');
    expect((await matcher().search(1,commands,text(''),' ',[])).matches).toEqual([]);
    const image:LaunchInput={id:'image',type:'image',from:'paste',image:{id:'i',name:'image.png',size:10,isDirectory:false,mime:'image/png'}};
    expect((await matcher().search(1,commands,image,'image',[])).matches.map(c=>c.id)).toEqual(['image']);
  });
  it('计算稿纸优先于通用文本插件，并保留公式与结果预览',async()=>{
    const result=await matcher().search(1,[plugin('translate',[{type:'text'}],'翻译')],text('1+1'),'1+1',['translate']);
    expect(result.matches.map(c=>c.id)).toEqual(['match:calc','translate','match:clipboard']);
    expect(result.matches[0]).toMatchObject({name:'计算稿纸',payload:'1+1',inputId:'input-1'});
    expect(result.matches[0].subtitle).toContain('1+1 = 2');
  });
  it.each(['π','pi','e','sin(pi)','cos(π)','2×(3+4)','50%'])('计算器支持的输入 %s 可以匹配计算稿纸',async value=>{
    const result=await matcher().search(1,[],text(value),value,[]);
    expect(result.matches[0]).toMatchObject({id:'match:calc',payload:value});
  });
  it.each(['hello','1+','1/0','sqrt(-1)'])('无效公式 %s 不产生计算入口',async value=>{
    const result=await matcher().search(1,[],text(value),value,[]);
    expect(result.matches.map(c=>c.id)).not.toContain('match:calc');
  });
  it('恶意正则不会阻塞普通搜索，后续正常规则继续生效',async()=>{
    const commands=[plugin('evil',[{type:'regex',pattern:'^(a+)+$'}]),plugin('good',[{type:'regex',pattern:'!$'}])];
    const value='a'.repeat(1000)+'!';
    const result=await matcher().search(1,commands,text(value),value,[]);
    expect(result.matches.map(c=>c.id)).toContain('good');
    expect(result.matches.map(c=>c.id)).not.toContain('evil');
    expect(result.warning).toContain('超时');
  });
  it('新查询取消旧 worker，不影响新结果',async()=>{
    const m=matcher(),commands=[plugin('evil',[{type:'regex',pattern:'^(a+)+$'}]),plugin('good',[{type:'regex',pattern:'^ok$'}])];
    const old=m.search(1,commands,text('a'.repeat(1000)+'!'),'a',[]);
    const next=m.search(1,commands,{...text('ok'),id:'new'},'ok',[]);
    expect((await old).cancelled).toBe(true);
    expect((await next).matches.find(c=>c.id==='good')?.inputId).toBe('new');
  });

  it('先提供普通搜索和内置匹配，再补充正则结果，复用 worker 后不会残留旧命中',async()=>{
    const m=matcher(),updates:any[]=[];
    const commands=[plugin('json',[{type:'regex',pattern:'^json$'}],'json'),plugin('regex-only',[{type:'regex',pattern:'^json$'}],'handler')];
    let completed=false;
    const first=m.search(1,commands,text('json'),'json',[],value=>{expect(completed).toBe(false);updates.push(value);});
    expect(updates[0].results.map((c:Command)=>c.id)).toEqual(['json']);
    expect(updates[0].matches.map((c:Command)=>c.id)).not.toContain('regex-only');
    const result=await first;completed=true;
    expect(result.matches.map(c=>c.id)).toContain('regex-only');
    const next=await m.search(1,commands,text('other'),'other',[]);
    expect(next.matches.map(c=>c.id)).not.toContain('regex-only');
    expect(next.matches.find(c=>c.id==='match:clipboard')?.payload).toBe('other');
  });

  it('一个窗口取消查询不影响另一窗口，关闭后没有待处理 worker',async()=>{
    const m=matcher(),commands=[plugin('slow',[{type:'regex',pattern:'^(a+)+$'}])];
    const old=m.search(1,commands,text('a'.repeat(1000)+'!'),'a',[]);
    const other=m.search(2,commands,text('ok'),'ok',[]);
    m.cancel(1);
    expect((await old).cancelled).toBe(true);
    expect((await other).cancelled).not.toBe(true);
    m.close();
  });
});
