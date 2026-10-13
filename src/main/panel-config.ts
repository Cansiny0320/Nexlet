import {randomUUID} from 'node:crypto';
import {panelCommands,type PanelConfig,type PanelItem,type PanelCommand} from '../shared/super-panel';
interface Storage {get<T>(key:string,fallback:T):T;set(key:string,value:unknown):void;}
const label=(v:unknown,max=250)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/[\0\r\n]/.test(v))throw Error('面板参数无效');return v.trim();};
export class PanelConfigStore {
 constructor(private store:Storage,private initial:()=>string[]){}
 read():PanelConfig{const saved=this.store.get<PanelConfig|null>('panel-config',null);if(saved)return saved;const config:PanelConfig={version:1,revision:0,enabled:true,mouse:'right',holdMs:200,shortcut:'',excludedApps:[],items:[...new Set(this.initial())].map(commandId=>({kind:'command',id:randomUUID(),commandId}))};this.store.set('panel-config',config);return config;}
 prepare(args:Record<string,any>):PanelConfig{
  const old=this.read();if(args.revision!==old.revision)throw Error('面板已在其他窗口修改，请刷新后重试');const next=structuredClone(old);
  const find=(id:string)=>next.items.find(i=>i.id===id)||panelCommands(next.items).find(i=>i.id===id);
  const remove=(id:string)=>{next.items=next.items.filter(i=>i.id!==id);for(const item of next.items)if(item.kind==='folder')item.children=item.children.filter(c=>c.id!==id);};
  if(args.action==='settings'){
   const p=args.patch;if(!p||typeof p!=='object')throw Error('面板设置无效');
   if('enabled'in p){if(typeof p.enabled!=='boolean')throw Error('开关无效');next.enabled=p.enabled;}
   if('mouse'in p){if(!['right','middle','off'].includes(p.mouse))throw Error('触发方式无效');next.mouse=p.mouse;}
   if('holdMs'in p){if(!Number.isInteger(p.holdMs)||p.holdMs<200||p.holdMs>400)throw Error('长按时间应为 200–400 ms');next.holdMs=p.holdMs;}
   if('shortcut'in p){if(typeof p.shortcut!=='string'||p.shortcut.length>80)throw Error('快捷键无效');next.shortcut=p.shortcut.trim();}
   if('excludedApps'in p){if(!Array.isArray(p.excludedApps)||p.excludedApps.length>100)throw Error('最多排除 100 个应用');next.excludedApps=[...new Set<string>(p.excludedApps.map((s:unknown)=>label(s,32767)))];}
  }else if(args.action==='add'){
   const commandId=label(args.commandId);if(!panelCommands(next.items).some(c=>c.commandId===commandId)){if(panelCommands(next.items).length>=200)throw Error('面板最多保存 200 项');next.items.push({kind:'command',id:randomUUID(),commandId});}
  }else if(args.action==='remove'){remove(label(args.id));}
  else if(args.action==='rename'){const item=find(label(args.id));if(item?.kind!=='folder')throw Error('文件夹已不存在');item.name=label(args.name,40);}
  else if(args.action==='moveOut'){const item=find(label(args.id));if(item?.kind!=='command')throw Error('功能已不存在');remove(item.id);next.items.push(item);}
  else if(args.action==='move'){
   const item=find(label(args.id)),target=find(label(args.target));if(!item||!target||item===target)throw Error('移动目标无效');
   if(args.position==='inside'){
    if(item.kind!=='command')throw Error('不支持嵌套文件夹');
    remove(item.id);
    if(target.kind==='folder')target.children.push(item);
    else{const parent=next.items.find(i=>i.kind==='folder'&&i.children.some(c=>c.id===target.id));if(parent?.kind==='folder')parent.children.push(item);else{const index=next.items.findIndex(i=>i.id===target.id);if(index<0)throw Error('目标已变化');next.items.splice(index,1,{kind:'folder',id:randomUUID(),name:'文件夹',children:[target,item]});}}
   }else if(['before','after'].includes(args.position)){
    const parent=next.items.find(i=>i.kind==='folder'&&i.children.some(c=>c.id===target.id));
    if(parent&&item.kind==='folder')throw Error('不支持嵌套文件夹');remove(item.id);
    const list:PanelItem[]=parent?.kind==='folder'?parent.children:next.items;
    const index=list.findIndex(i=>i.id===target.id);if(index<0)throw Error('不能将文件夹移入自身');list.splice(index+(args.position==='after'?1:0),0,item);
   }else throw Error('排序位置无效');
  }else throw Error('面板操作无效');
  next.items=next.items.filter(i=>i.kind!=='folder'||i.children.length);next.revision++;return next;
 }
 save(config:PanelConfig){this.store.set('panel-config',config);}
 patch(args:Record<string,any>){const config=this.prepare(args);this.save(config);return config;}
}
