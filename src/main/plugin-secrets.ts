interface SecretStore { get<T>(key:string,fallback:T):T; set(key:string,value:unknown):void; }
interface Encryption { isEncryptionAvailable():boolean; encryptString(value:string):Buffer; decryptString(value:Buffer):string; getSelectedStorageBackend?():string; }
export class PluginSecrets {
  private temporary=new Map<number,{plugin:string;values:Record<string,string>}>();
  constructor(private store:SecretStore,private encryption:Encryption){}
  private key(value:unknown):string {if(typeof value!=='string'||!/^[a-zA-Z0-9_.-]{1,100}$/.test(value)||['__proto__','constructor','prototype'].includes(value))throw new Error('密钥名称无效');return value;}
  private available(){return this.encryption.isEncryptionAvailable()&&this.encryption.getSelectedStorageBackend?.()!=='basic_text';}
  get(plugin:string,session:number,name:unknown):string|null {
    const key=this.key(name),temporary=this.temporary.get(session);
    if(temporary?.plugin===plugin&&Object.hasOwn(temporary.values,key))return temporary.values[key];
    const data=this.store.get<Record<string,string>>('plugin-secrets:'+plugin,{});
    if(!Object.hasOwn(data,key))return null;
    if(!this.available())throw new Error('系统密钥存储不可用，请重新输入 API Key，本次会话使用');
    try{return this.encryption.decryptString(Buffer.from(data[key],'base64'));}catch{throw new Error('无法解密 API Key，请重新输入并保存');}
  }
  set(plugin:string,session:number,name:unknown,value:unknown):{persistent:boolean}{
    const key=this.key(name);
    if(value!==null&&(typeof value!=='string'||value.length>16384))throw new Error('密钥值无效或过长');
    const data=this.store.get<Record<string,string>>('plugin-secrets:'+plugin,{});
    const persistent=value===null||this.available();
    if(value===null||!persistent)delete data[key];else data[key]=this.encryption.encryptString(value as string).toString('base64');
    this.store.set('plugin-secrets:'+plugin,data);
    let temporary=this.temporary.get(session);
    if(!temporary||temporary.plugin!==plugin){temporary={plugin,values:{}};this.temporary.set(session,temporary);}
    if(value!==null&&!persistent)temporary.values[key]=value as string;else delete temporary.values[key];
    return {persistent};
  }
  close(session:number){this.temporary.delete(session);}
  remove(plugin:string){this.store.set('plugin-secrets:'+plugin,{});for(const [session,data] of this.temporary)if(data.plugin===plugin)this.temporary.delete(session);}
}
