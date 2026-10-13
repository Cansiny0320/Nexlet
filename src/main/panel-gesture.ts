export interface GestureEvent {type:'down'|'up'|'move';button:string;time:number;x:number;y:number;}
export interface GestureEffect {suppress:boolean;replay?:'down'|'click';point?:{x:number;y:number};trigger?:{x:number;y:number};release?:{x:number;y:number;quick:boolean};}
/** No OS work in this state machine: the native callback only applies effects. */
export class PanelGesture {
 private held?:{x:number;y:number;time:number;shown?:number};
 constructor(private button:'right'|'middle',private holdMs:number){}
 handle(event:GestureEvent):GestureEffect{
  if(event.type==='move'){
   if(this.held&&this.held.shown===undefined&&Math.hypot(event.x-this.held.x,event.y-this.held.y)>6)return this.cancel();
   return {suppress:!!this.held};
  }
  if(event.button!==this.button)return {suppress:false};
  if(event.type==='down'){
   if(this.held)return {suppress:true};
   this.held={x:event.x,y:event.y,time:event.time,...(this.button==='middle'?{shown:event.time}:{})};
   return {suppress:true,...(this.button==='middle'?{trigger:{x:event.x,y:event.y}}:{})};
  }
  const held=this.held;this.held=undefined;if(!held)return {suppress:false};
  return held.shown===undefined?{suppress:true,replay:'click',point:held}:{suppress:true,release:{x:event.x,y:event.y,quick:event.time-held.shown<300}};
 }
 tick(time:number):GestureEffect{if(this.held&&this.held.shown===undefined&&time-this.held.time>=this.holdMs){this.held.shown=time;return {suppress:false,trigger:{x:this.held.x,y:this.held.y}};}return {suppress:false};}
 cancel():GestureEffect{const held=this.held;this.held=undefined;return held&&held.shown===undefined?{suppress:false,replay:'down',point:held}:{suppress:false};}
}
