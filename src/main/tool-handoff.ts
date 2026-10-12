import {randomUUID} from 'node:crypto';
import {validateToolSnapshot,type ToolSessionSnapshot} from '../shared/tool-session';
interface Transfer {source:number;target:number;snapshot:ToolSessionSnapshot;resolve:()=>void;reject:(e:Error)=>void;}
export class ToolHandoffs {
  private transfers=new Map<string,Transfer>();
  async transfer(source:number,value:unknown,create:(token:string)=>{id:number;show:()=>void;destroy:()=>void},timeout=8000){
    if([...this.transfers.values()].some(t=>t.source===source))throw Error('正在分离此工具');
    const snapshot=validateToolSnapshot(value),token=randomUUID();
    const target=create(token);
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      await new Promise<void>((resolve,reject)=>{this.transfers.set(token,{source,target:target.id,snapshot,resolve,reject});timer=setTimeout(()=>reject(Error('独立窗口恢复超时，原工具已保留')),timeout);});
      target.show();
    }catch(e){target.destroy();throw e;}finally{clearTimeout(timer);this.transfers.delete(token);}
  }
  read(target:number,token:string){const transfer=this.transfers.get(token);if(!transfer||transfer.target!==target)throw Error('工具交接已失效');return transfer.snapshot;}
  acknowledge(target:number,token:string,error?:string){this.read(target,token);const transfer=this.transfers.get(token)!;if(error)transfer.reject(Error(error));else transfer.resolve();}
  forget(id:number){for(const transfer of this.transfers.values())if(transfer.source===id||transfer.target===id)transfer.reject(Error('工具交接窗口已关闭'));}
}
