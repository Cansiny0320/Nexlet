import { t } from '../shared/i18n';
export interface SelectionTarget {pid:number;handle?:string;app:string;name?:string;}
export type SelectionContent={type:'text';text:string}|{type:'files';paths:string[]}|{type:'image';data:string};
export interface SelectionResult {target:SelectionTarget|null;content?:SelectionContent;issue?:string;}
export interface SelectionBackend {
 target():Promise<SelectionTarget|null>;same(target:SelectionTarget):Promise<boolean>;
 direct(target:SelectionTarget):Promise<SelectionContent|null|undefined>;
 sequence():number|null;snapshot():Promise<Record<string,unknown>>;restore(snapshot:Record<string,unknown>,expected:number):Promise<void>;
 copy(target:SelectionTarget):Promise<void>;read():Promise<SelectionContent|undefined>;
 exclusive<T>(work:()=>Promise<T>):Promise<T>;waitKeys():Promise<boolean>;delay(ms:number):Promise<void>;now():number;
}
export class SelectionService {
 private generation=0;private pending:Promise<unknown>=Promise.resolve();
 constructor(private backend:SelectionBackend){}
 cancel(){this.generation++;}
 async capture(excluded:string[]=[]):Promise<SelectionResult>{
  const generation=++this.generation,target=await this.backend.target();
  const result:SelectionResult={target};
  const matches=excluded.some(value=>[target?.app,target?.name].some(name=>name?.toLowerCase()===value.toLowerCase()));
  if(!target||matches)return {...result,issue:matches?t("当前应用已排除选区获取"):undefined};
  const previous=this.pending;
  const work=(async()=>{
   await previous.catch(()=>{});
   const current=async()=>generation===this.generation&&await this.backend.same(target);
   if(!await current())return result;
   try{
    const direct=await this.backend.direct(target);
    if(!await current())return result;
    if(direct!==undefined)return {...result,...(direct?{content:direct}:{})};
    return await this.backend.exclusive(async()=>{
     const before=this.backend.sequence();if(before===null)return {...result,issue:t("无法确认剪贴板版本，请手动粘贴选区")};
     const snapshot=await this.backend.snapshot();
     if(this.backend.sequence()!==before||!await this.backend.waitKeys()||!await current())return result;
     await this.backend.copy(target);
     let capturedVersion:number|undefined;
     try{
      const deadline=this.backend.now()+650;
      // A sent copy may complete after cancellation; finish observing it so our
      // own temporary clipboard can still be restored before the next request.
      while(this.backend.sequence()===before&&this.backend.now()<deadline)await this.backend.delay(25);
      const version=this.backend.sequence();if(version===null||version===before)return result;
      // Pasteboard owners can announce a new version before all items are populated.
      // Abort if a different writer changes it during this short settling period.
      await this.backend.delay(50);
      if(this.backend.sequence()!==version)return result;
      if(!await this.backend.same(target))return result;
      capturedVersion=version;
      const content=await this.backend.read();
      if(this.backend.sequence()!==version||!await current())return result;
      return {...result,...(content?{content}:{})};
     }finally{
      if(capturedVersion!==undefined&&this.backend.sequence()===capturedVersion)await this.backend.restore(snapshot,capturedVersion);
     }
    });
   }catch(error){return {...result,issue:(error as Error).message||t("无法读取选区，请手动粘贴")};}
  })();this.pending=work;return work;
 }
}
