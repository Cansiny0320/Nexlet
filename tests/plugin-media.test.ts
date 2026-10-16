import {expect,it,vi} from 'vitest';
vi.mock('electron',()=>({utilityProcess:{}}));
vi.mock('../src/main/plugin-sdk/process',()=>({runProcess:vi.fn(async()=>({code:0,stdout:'external ffmpeg',stderr:''}))}));
import {PluginMedia} from '../src/main/plugin-sdk/media';
import {PluginTasks} from '../src/main/plugin-sdk/tasks';
import {runProcess} from '../src/main/plugin-sdk/process';
import type {SdkContext} from '../src/main/plugin-sdk/context';
function context(permissions:string[]):SdkContext {
 return {contents:{id:1},require(permission:string){if(!permissions.includes(permission))throw Error('permission: '+permission);},emit:vi.fn()} as unknown as SdkContext;
}
it('requires an explicit executable and all media/files/process permissions',async()=>{
 const media=new PluginMedia(new PluginTasks());vi.mocked(runProcess).mockClear();
 await expect(media.invoke(context(['media','files','process']),'media.ffmpeg',{id:'missing',args:[]})).rejects.toThrow('executable');
 for(const missing of ['media','files','process'])await expect(media.invoke(context(['media','files','process'].filter(p=>p!==missing)),'media.ffmpeg',{id:'denied',executable:'ffmpeg',args:[]})).rejects.toThrow('permission: '+missing);
 expect(runProcess).not.toHaveBeenCalled();
 await expect(media.invoke(context(['media','files','process']),'media.ffmpeg',{id:'explicit',executable:'custom-ffmpeg',args:['-version']})).resolves.toMatchObject({code:0});
 expect(vi.mocked(runProcess).mock.calls[0][0]).toMatchObject({executable:'custom-ffmpeg',args:['-nostdin','-progress','pipe:1','-nostats','-version']});
});
