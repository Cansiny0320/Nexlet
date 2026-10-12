import {afterEach,expect,it,vi} from 'vitest';
const {read,readText}=vi.hoisted(()=>({read:vi.fn(),readText:vi.fn()}));
vi.mock('electron',()=>({clipboard:{read,readText},ClipboardItem:class{},nativeImage:{createEmpty:()=>({isEmpty:()=>true})}}));
import {ClipboardService} from '../src/main/clipboard';
afterEach(()=>{vi.restoreAllMocks();read.mockReset();readText.mockReset();});
it.each(['darwin','win32'] as const)('%s 明确收录等待正在执行的后台捕获，再读取本次内容',async(platform)=>{
 vi.spyOn(process,'platform','get').mockReturnValue(platform);
 let release!:(value:unknown[])=>void;read.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValue([]);readText.mockResolvedValueOnce('earlier').mockResolvedValueOnce('selected input');
 const addClip=vi.fn(),store={settings:()=>({clipboardEnabled:true}),addClip,prune:()=>{},hasClipHash:()=>false};const service=new ClipboardService(store as any,{sequence:()=>null,readFiles:async()=>[]} as any,()=>{});
 const background=service.capture();let settled=false;const manual=service.capture(true).then(()=>{settled=true;});await Promise.resolve();expect(settled).toBe(false);
 release([]);await Promise.all([background,manual]);expect(addClip.mock.calls.map(([item])=>item.text)).toEqual(['earlier','selected input']);
});
