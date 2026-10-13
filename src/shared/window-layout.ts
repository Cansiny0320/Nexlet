export interface WindowRect {x:number;y:number;width:number;height:number;}
export interface WindowDisplay {id:number;workArea:WindowRect;}
export const WINDOW_LAYOUTS=[
 {id:'left',name:'左半屏',box:[0,0,.5,1]}, {id:'right',name:'右半屏',box:[.5,0,1,1]},
 {id:'top',name:'上半屏',box:[0,0,1,.5]}, {id:'bottom',name:'下半屏',box:[0,.5,1,1]},
 {id:'top-left',name:'左上四分屏',box:[0,0,.5,.5]}, {id:'top-right',name:'右上四分屏',box:[.5,0,1,.5]},
 {id:'bottom-left',name:'左下四分屏',box:[0,.5,.5,1]}, {id:'bottom-right',name:'右下四分屏',box:[.5,.5,1,1]},
 {id:'third-left',name:'左三分屏',box:[0,0,1/3,1]}, {id:'third-center',name:'中三分屏',box:[1/3,0,2/3,1]}, {id:'third-right',name:'右三分屏',box:[2/3,0,1,1]},
 {id:'two-thirds-left',name:'左 2/3 屏',box:[0,0,2/3,1]}, {id:'two-thirds-right',name:'右 2/3 屏',box:[1/3,0,1,1]},
 {id:'maximize',name:'窗口最大化',box:[0,0,1,1]}, {id:'center',name:'窗口居中',box:[]}
] as const;
export function layoutBounds(id:string,area:WindowRect,current:WindowRect):WindowRect{
 const layout=WINDOW_LAYOUTS.find(l=>l.id===id);if(!layout)throw Error('不支持的窗口布局');
 if(id==='center'){const width=Math.min(current.width,area.width),height=Math.min(current.height,area.height);return {x:Math.round(area.x+(area.width-width)/2),y:Math.round(area.y+(area.height-height)/2),width,height};}
 const [l,t,r,b]=layout.box as readonly number[];
 const x=area.x+Math.round(area.width*l),y=area.y+Math.round(area.height*t);
 return {x,y,width:area.x+Math.round(area.width*r)-x,height:area.y+Math.round(area.height*b)-y};
}
export function displayFor(rect:WindowRect,displays:WindowDisplay[]):WindowDisplay{
 if(!displays.length)throw Error('没有可用显示器');
 const area=(d:WindowDisplay)=>Math.max(0,Math.min(rect.x+rect.width,d.workArea.x+d.workArea.width)-Math.max(rect.x,d.workArea.x))*Math.max(0,Math.min(rect.y+rect.height,d.workArea.y+d.workArea.height)-Math.max(rect.y,d.workArea.y));
 return [...displays].sort((a,b)=>area(b)-area(a)||Math.hypot(a.workArea.x-rect.x,a.workArea.y-rect.y)-Math.hypot(b.workArea.x-rect.x,b.workArea.y-rect.y))[0];
}
export function sameBounds(a:WindowRect,b:WindowRect){return (['x','y','width','height'] as const).every(k=>Math.abs(a[k]-b[k])<=2);}
export function fitBounds(rect:WindowRect,area:WindowRect):WindowRect{const width=Math.min(rect.width,area.width),height=Math.min(rect.height,area.height);return {x:Math.round(Math.max(area.x,Math.min(rect.x,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(rect.y,area.y+area.height-height))),width:Math.round(width),height:Math.round(height)};}
