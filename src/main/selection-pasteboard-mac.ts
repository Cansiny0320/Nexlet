import { t as translate } from '../shared/i18n';
import koffi from 'koffi';
export type NativePasteboardSnapshot={native:'mac';data:Record<string,Buffer>[]};
let appKit:ReturnType<typeof koffi.load>|undefined;
/** Materialize native bytes; Electron's HTML writer normalizes markup on restore. */
export function createSelectionPasteboard(name?:string){
 appKit??=koffi.load('/System/Library/Frameworks/AppKit.framework/AppKit');
 const objc=koffi.load('/usr/lib/libobjc.A.dylib'),cf=koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
 const cls=objc.func('void *objc_getClass(const char *)'),sel=objc.func('void *sel_registerName(const char *)');
 const object=objc.func('objc_msgSend','void *',['void *','void *']),withObject=objc.func('objc_msgSend','void *',['void *','void *','void *']),at=objc.func('objc_msgSend','void *',['void *','void *','uintptr_t']);
 const integer=objc.func('objc_msgSend','intptr_t',['void *','void *']),string=objc.func('objc_msgSend','str',['void *','void *']),message=objc.func('objc_msgSend','void',['void *','void *']);
 const add=objc.func('objc_msgSend','void',['void *','void *','void *']),data=objc.func('objc_msgSend','void *',['void *','void *','void *','uintptr_t']),set=objc.func('objc_msgSend','bool',['void *','void *','void *','void *']),write=objc.func('objc_msgSend','bool',['void *','void *','void *']);
 const makeString=cf.func('void *CFStringCreateWithCString(void *,const char *,uint32_t)'),release=cf.func('void CFRelease(void *)');
 const selectors=Object.fromEntries(['alloc','init','autorelease','drain','generalPasteboard','pasteboardWithName:','pasteboardItems','types','count','objectAtIndex:','dataForType:','length','bytes','UTF8String','changeCount','clearContents','array','addObject:','dataWithBytes:length:','setData:forType:','writeObjects:'].map(s=>[s,sel(s)]));
 const boardClass=cls('NSPasteboard'),poolClass=cls('NSAutoreleasePool'),arrayClass=cls('NSMutableArray'),itemClass=cls('NSPasteboardItem'),dataClass=cls('NSData');
 const pooled=<T>(work:(board:unknown)=>T):T=>{
  const pool=object(object(poolClass,selectors.alloc),selectors.init);let key:unknown;
  try{if(name)key=makeString(null,name,0x08000100);const board=name?withObject(boardClass,selectors['pasteboardWithName:'],key):object(boardClass,selectors.generalPasteboard);if(!board)throw Error(translate("无法访问原剪贴板"));return work(board);}
  finally{if(key)release(key);if(pool)message(pool,selectors.drain);}
 };
 return {
  sequence:()=>pooled(board=>Number(integer(board,selectors.changeCount))),
  snapshot:():NativePasteboardSnapshot=>pooled(board=>{
   const entries=object(board,selectors.pasteboardItems),count=Number(integer(entries,selectors.count));if(count>100)throw Error(translate("原剪贴板内容过多，请手动粘贴选区"));
   const result:Record<string,Buffer>[]=[];let total=0;
   for(let i=0;i<count;i++){
    const item=at(entries,selectors['objectAtIndex:'],i),types=object(item,selectors.types),typeCount=Number(integer(types,selectors.count));if(typeCount>128)throw Error(translate("原剪贴板格式过多，请手动粘贴选区"));
    const values:Record<string,Buffer>=Object.create(null);
    for(let t=0;t<typeCount;t++){
     const type=at(types,selectors['objectAtIndex:'],t),key=string(type,selectors.UTF8String),value=withObject(item,selectors['dataForType:'],type);if(!value)throw Error(translate("无法完整读取原剪贴板，请手动粘贴选区"));
     const length=Number(integer(value,selectors.length));total+=length;if(total>64*1024*1024)throw Error(translate("原剪贴板超过 64 MB，请手动粘贴选区"));
     values[key]=length?Buffer.from(koffi.decode(object(value,selectors.bytes),'uint8_t',length)):Buffer.alloc(0);
    }
    result.push(values);
   }
   return {native:'mac',data:result};
  }),
  restore:(snapshot:NativePasteboardSnapshot,expected:number):boolean=>pooled(board=>{
   // Prepare every object before taking ownership of the pasteboard.
   const entries=object(arrayClass,selectors.array);
   for(const values of snapshot.data){
    const item=object(object(object(itemClass,selectors.alloc),selectors.init),selectors.autorelease);
    for(const [type,bytes] of Object.entries(values)){
     const key=makeString(null,type,0x08000100);
     try{const value=data(dataClass,selectors['dataWithBytes:length:'],bytes,bytes.length);if(!set(item,selectors['setData:forType:'],value,key))throw Error(translate("无法准备原剪贴板格式"));}finally{release(key);}
    }
    add(entries,selectors['addObject:'],item);
   }
   if(Number(integer(board,selectors.changeCount))!==expected)return false;
   integer(board,selectors.clearContents);
   if(snapshot.data.length&&!write(board,selectors['writeObjects:'],entries))throw Error(translate("恢复原剪贴板失败"));
   return true;
  })
 };
}
