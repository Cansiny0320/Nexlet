import { expect, it, vi } from 'vitest';
import { registerUpdateSave, saveBeforeUpdate } from '../src/renderer/update-save';
it('离开稿纸页后仍等待尚未完成的保存',async()=>{
 let finish!:()=>void;const save=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
 const remove=registerUpdateSave(save);const complete=vi.fn();const pending=saveBeforeUpdate().then(complete);
 await Promise.resolve();expect(complete).not.toHaveBeenCalled();finish();await pending;expect(complete).toHaveBeenCalledOnce();
 save.mockResolvedValue(undefined);remove();await Promise.resolve();
});
it('离开页面时的保存失败不会在安装前被忽略',async()=>{
 const save=vi.fn(async():Promise<void>=>{throw Error('保存冲突');});const remove=registerUpdateSave(save);remove();await Promise.resolve();
 await expect(saveBeforeUpdate()).rejects.toThrow('保存冲突');
 save.mockResolvedValue(undefined);remove();await Promise.resolve();await saveBeforeUpdate();
});
