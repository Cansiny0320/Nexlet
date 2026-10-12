import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({search:vi.fn(),forget:vi.fn(),reset:vi.fn(),stop:vi.fn(),stat:vi.fn(),copy:vi.fn(),open:vi.fn(),reveal:vi.fn()}));
vi.mock('electron',()=>({app:{},clipboard:{writeText:mocks.copy},shell:{openPath:mocks.open,showItemInFolder:mocks.reveal}}));
vi.mock('node:fs/promises',()=>({stat:mocks.stat}));
vi.mock('../src/main/everything-engine',()=>({EverythingEngine:class{stop=mocks.stop;}}));
vi.mock('../src/main/spotlight',()=>({SpotlightSearch:class{search=mocks.search;forget=mocks.forget;reset=mocks.reset;}}));
import { EverythingSearch } from '../src/main/everything';
const result=(file:string)=>({status:'ready',message:'',items:[{path:file}],limited:false});
beforeEach(()=>{vi.resetAllMocks();mocks.stat.mockResolvedValue({});mocks.open.mockResolvedValue('');});
describe('macOS 文件操作与结果有效期',()=>{
  it('仅允许操作所属窗口的当前结果',async()=>{
    mocks.search.mockResolvedValue(result('/tmp/report.pdf'));const search=new EverythingSearch(()=>[],'darwin');
    await search.search(1,'report');
    await expect(search.action(2,'open','/tmp/report.pdf')).rejects.toThrow('当前搜索结果');
    await search.action(1,'open','/tmp/report.pdf');await search.action(1,'reveal','/tmp/report.pdf');await search.action(1,'copy','/tmp/report.pdf');
    expect(mocks.open).toHaveBeenCalledWith('/tmp/report.pdf');expect(mocks.reveal).toHaveBeenCalledWith('/tmp/report.pdf');expect(mocks.copy).toHaveBeenCalledWith('/tmp/report.pdf');
  });
  it('旧查询晚返回不能覆盖新结果授权',async()=>{
    let resolve!:(value:unknown)=>void;mocks.search.mockReturnValueOnce(new Promise(done=>{resolve=done;})).mockResolvedValueOnce(result('/tmp/new'));
    const search=new EverythingSearch(()=>[],'darwin'),old=search.search(1,'old');await search.search(1,'new');resolve(result('/tmp/old'));await old;
    await expect(search.action(1,'copy','/tmp/old')).rejects.toThrow('当前搜索结果');await search.action(1,'copy','/tmp/new');
  });
  for(const lifecycle of ['reset','forget','close'] as const)it(lifecycle+' 后过期查询不能恢复授权',async()=>{
    let resolve!:(value:unknown)=>void;mocks.search.mockReturnValueOnce(new Promise(done=>{resolve=done;})).mockResolvedValueOnce(result('/tmp/new'));
    const search=new EverythingSearch(()=>[],'darwin'),old=search.search(1,'old');
    if(lifecycle==='forget')search.forget(1);else await search[lifecycle]();
    await search.search(1,'new');resolve(result('/tmp/old'));await old;
    await expect(search.action(1,'copy','/tmp/old')).rejects.toThrow('当前搜索结果');await search.action(1,'copy','/tmp/new');expect(mocks.stop).not.toHaveBeenCalled();
  });
  it('文件已删除时返回可理解的错误',async()=>{
    mocks.search.mockResolvedValue(result('/tmp/gone'));mocks.stat.mockRejectedValue(Error('ENOENT'));
    const search=new EverythingSearch(()=>[],'darwin');await search.search(1,'gone');await expect(search.action(1,'open','/tmp/gone')).rejects.toThrow('文件已移动、删除或无法访问');
  });
});
