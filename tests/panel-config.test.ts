import {describe,it,expect} from 'vitest';
import {PanelConfigStore} from '../src/main/panel-config';
const fixture=()=>{const data=new Map<string,unknown>();return new PanelConfigStore({get:(k,f)=>data.has(k)?data.get(k) as any:f,set:(k,v)=>{data.set(k,v);}},()=>['tool:json','tool:clipboard']);};
describe('panel configuration',()=>{
 it('seeds independently, moves into and out of a folder without losing commands',()=>{const s=fixture();let c=s.read();const [a,b]=c.items;expect(c.items).toHaveLength(2);c=s.patch({action:'move',id:a.id,target:b.id,position:'inside',revision:c.revision});expect(c.items).toHaveLength(1);const folder=c.items[0];expect(folder.kind).toBe('folder');if(folder.kind!=='folder')throw Error();expect(folder.children.map(x=>x.commandId)).toEqual(['tool:clipboard','tool:json']);c=s.patch({action:'moveOut',id:a.id,revision:c.revision});expect(c.items).toHaveLength(2);expect(c.items[1].id).toBe(a.id);});
 it('rejects stale revision without overwriting saved preferences',()=>{const s=fixture();const old=s.read();s.patch({action:'settings',patch:{holdMs:300},revision:old.revision});expect(()=>s.patch({action:'remove',id:old.items[0].id,revision:old.revision})).toThrow('其他');expect(s.read().holdMs).toBe(300);});
 it('does not duplicate a command and validates settings',()=>{const s=fixture();s.patch({action:'add',commandId:'tool:json',revision:s.read().revision});expect(s.read().items).toHaveLength(2);expect(()=>s.patch({action:'settings',patch:{holdMs:999},revision:s.read().revision})).toThrow();});
});
it('reorders across folders without allowing nested folders or removing children accidentally',()=>{
 const s=fixture();let c=s.read();c=s.patch({action:'add',commandId:'tool:encoding',revision:c.revision});const [a,b,d]=c.items;c=s.patch({action:'move',id:a.id,target:b.id,position:'inside',revision:c.revision});const folder=c.items.find(i=>i.kind==='folder')!;
 expect(()=>s.patch({action:'move',id:folder.id,target:a.id,position:'before',revision:c.revision})).toThrow('嵌套');
 c=s.patch({action:'move',id:d.id,target:a.id,position:'before',revision:c.revision});if(c.items[0].kind!=='folder')throw Error();expect(c.items[0].children.map(i=>i.commandId)).toEqual(['tool:clipboard','tool:encoding','tool:json']);
});
