import {describe,it,expect} from 'vitest';
import {layoutBounds,WINDOW_LAYOUTS,type WindowRect} from '../src/shared/window-layout';
import {WindowActions,type WindowBackend} from '../src/main/window-actions';
const left={id:1,workArea:{x:-1200,y:80,width:1200,height:800}},right={id:2,workArea:{x:0,y:0,width:1500,height:900}};
describe('window layouts',()=>{
 it('covers all 15 layouts with rounded shared edges and negative origins',()=>{
  expect(WINDOW_LAYOUTS).toHaveLength(15);
  for(const {id} of WINDOW_LAYOUTS){const r=layoutBounds(id,left.workArea,{x:10,y:20,width:400,height:300});expect(r.x).toBeGreaterThanOrEqual(-1200);expect(r.y).toBeGreaterThanOrEqual(80);expect(r.x+r.width).toBeLessThanOrEqual(0);expect(r.y+r.height).toBeLessThanOrEqual(880);}
  const area={x:-99,y:10,width:1001,height:601};const a=layoutBounds('left',area,area),b=layoutBounds('right',area,area);expect(a.x+a.width).toBe(b.x);expect(a.width+b.width).toBe(area.width);
 });
 it('centers without growing and keeps oversized windows within work area',()=>{expect(layoutBounds('center',left.workArea,{x:0,y:0,width:400,height:300})).toEqual({x:-800,y:330,width:400,height:300});expect(layoutBounds('center',left.workArea,{x:0,y:0,width:9000,height:9000})).toEqual(left.workArea);});
});
function fixture(){let rect:WindowRect={x:100,y:120,width:700,height:450},target='a',alive=true;const writes:WindowRect[]=[];const backend:WindowBackend={capture:()=>target,read:()=>{if(!alive)throw Error('窗口已关闭');return rect;},write:(_id,next)=>{rect={...next};writes.push(rect);},activate:()=>{},close:()=>{}};return {actions:new WindowActions(backend,()=>[left,right]),writes,rect:()=>rect,remove:()=>{alive=false;},target:(v:string)=>{target=v;}};}
it('restores the original bounds after several layout actions and cycles to adjacent displays',()=>{
 const f=fixture();f.actions.remember();const original=f.rect();f.actions.execute('left');expect(f.rect()).toEqual({x:0,y:0,width:750,height:900});f.actions.execute('left');expect(f.rect()).toEqual({x:-1200,y:80,width:600,height:800});f.actions.execute('bottom-right');f.actions.execute('restore');expect(f.rect()).toEqual(original);
});
it('rejects missing and stale targets without applying a write',()=>{const f=fixture();expect(()=>f.actions.execute('left')).toThrow('窗口');f.actions.remember();f.remove();expect(()=>f.actions.execute('left')).toThrow('关闭');expect(f.writes).toEqual([]);});
it('does not overwrite a remembered external target when Nexlet is foreground',()=>{const f=fixture();f.actions.remember();f.target('');f.actions.remember();f.actions.execute('right');expect(f.writes).toHaveLength(1);});
it('moves between displays proportionally and restores original geometry',()=>{const f=fixture();f.actions.remember();const old=f.rect();f.actions.execute('previous-display');expect(f.rect().x).toBeLessThan(0);expect(f.rect().y).toBeGreaterThanOrEqual(80);f.actions.execute('restore');expect(f.rect()).toEqual(old);});
