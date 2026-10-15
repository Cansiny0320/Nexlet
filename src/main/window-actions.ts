import { t } from '../shared/i18n';
import {displayFor,fitBounds,layoutBounds,sameBounds,type WindowDisplay,type WindowRect} from '../shared/window-layout';
export interface WindowBackend {capture():string|null;read(id:string):WindowRect;write(id:string,bounds:WindowRect):void;activate(id:string):void;close():void;}
export class WindowActions {
 private target:string|null=null;
 private issue:string|null=null;
 private original=new Map<string,WindowRect>();
 constructor(private backend:WindowBackend,private displays:()=>WindowDisplay[]){}
 remember(){try{const target=this.backend.capture();if(target){this.target=target;this.issue=null;}}catch(error){this.target=null;this.issue=(error as Error).message;}}
 execute(action:string){
  const id=this.target;if(!id)throw Error(this.issue||t("请先激活要调整的窗口，再唤起 Nexlet"));
  const before=this.backend.read(id),displays=this.displays(),current=displayFor(before,displays);
  let desired:WindowRect;
  if(action==='restore'){
   const previous=this.original.get(id);if(!previous)throw Error(t("当前窗口没有可恢复的位置"));
   desired=fitBounds(previous,displayFor(previous,displays).workArea);
  }else{
   if(!this.original.has(id)){this.original.set(id,{...before});if(this.original.size>32)this.original.delete(this.original.keys().next().value!);}
   const ordered=[...displays].sort((a,b)=>a.workArea.x-b.workArea.x||a.workArea.y-b.workArea.y);
   const adjacent=(direction:number)=>ordered[(ordered.findIndex(d=>d.id===current.id)+direction+ordered.length)%ordered.length];
   if(action==='previous-display'||action==='next-display'){
    const area=adjacent(action==='previous-display'?-1:1).workArea,old=current.workArea;
    desired=fitBounds({x:area.x+(before.x-old.x)/old.width*area.width,y:area.y+(before.y-old.y)/old.height*area.height,width:before.width,height:before.height},area);
   }else{
    let area=current.workArea;
    if((action==='left'||action==='right')&&sameBounds(before,layoutBounds(action,area,before)))area=adjacent(action==='left'?-1:1).workArea;
    desired=layoutBounds(action,area,before);
   }
  }
  this.backend.write(id,desired);this.backend.activate(id);
  if(action==='restore')this.original.delete(id);
  const actual=this.backend.read(id);
  return {bounds:actual,...(!sameBounds(actual,desired)?{warning:t("目标应用限制了窗口尺寸或位置，已按其允许的范围调整")}:{})};
 }
 close(){this.backend.close();this.original.clear();this.target=null;}
}
