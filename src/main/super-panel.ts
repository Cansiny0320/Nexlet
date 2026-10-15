import {BrowserWindow,screen} from 'electron';
import type {Command} from '../shared/types';
import {panelBounds,type PanelConfig,type PanelState,type PanelStatus} from '../shared/super-panel';
import type {LaunchInput} from '../shared/launch';
import type {LaunchInputs} from './launch-input';
import type {SelectionService,SelectionTarget,SelectionResult} from './selection';
import type {SelectionPlatform} from './selection-platform';
import {revealWindow} from './window-visibility';
interface Dependencies {
 beforeOpen?:()=>void;
 create:()=>Promise<BrowserWindow>;config:()=>PanelConfig;status:()=>PanelStatus;commands:()=>Command[];theme:()=>string;
 matches:(owner:number,input:LaunchInput)=>Promise<Command[]>;execute:(owner:BrowserWindow,id:string,input:LaunchInput|null)=>Promise<void>;
 toLauncher:(owner:BrowserWindow,input:LaunchInput|null)=>Promise<void>;busy:()=>boolean;changed:()=>void;
}
export class SuperPanelController {
 window:BrowserWindow|null=null;
 private opening:Promise<BrowserWindow>|null=null;private generation=0;private input:LaunchInput|null=null;private target:SelectionTarget|null=null;
 private matches:Command[]=[];private preview?:string;private issue?:string;private loading=false;private executing=false;private pendingRelease:{x:number;y:number}|null=null;
 constructor(private inputs:LaunchInputs,private selection:SelectionService,private platform:SelectionPlatform,private deps:Dependencies){}
 get busy(){return this.executing;}
 owns(window:BrowserWindow){return this.window===window;}
 state():PanelState&{theme:string}{
  const commands=this.deps.commands(), names=new Map(commands.map(command=>[command.id,command.name]));
  const matches=this.matches.map(command=>({...command,name:names.get(command.id)||command.name}));
  return {config:this.deps.config(),status:this.deps.status(),commands,matches,input:this.input,preview:this.preview,issue:this.issue,loading:this.loading,theme:this.deps.theme()};
 }
 private changed(){if(this.window&&!this.window.isDestroyed())this.window.webContents.send('host-change','panel-state');}
 private async ensure(){
  if(this.window&&!this.window.isDestroyed())return this.window;
  if(!this.opening)this.opening=this.deps.create().then(window=>{this.window=window;window.on('blur',()=>{if(!this.loading&&!this.executing)this.hide(false);});window.on('closed',()=>{this.generation++;this.selection.cancel();this.window=null;});return window;}).finally(()=>{this.opening=null;});
  return this.opening;
 }
 async open(mode:'mouse'|'keyboard'='keyboard',point=screen.getCursorScreenPoint(),fixture?:SelectionResult){
  if(this.executing||this.deps.busy()||!this.deps.config().enabled)return;
  if(!fixture)this.deps.beforeOpen?.();
  const generation=++this.generation;this.loading=true;this.executing=false;this.pendingRelease=null;this.input=null;this.matches=[];this.preview=undefined;this.issue=undefined;
  // Capture starts before any window is shown or focused.
  const capture=fixture?Promise.resolve(fixture):this.selection.capture(this.deps.config().excludedApps);
  try{
   const window=await this.ensure(),result=await capture;
   if(generation!==this.generation)return;
   this.inputs.clear(window.webContents.id);
   let input:LaunchInput|null=null,matches:Command[]=[],preview:string|undefined;
   if(result.content){input=await this.inputs.captureSelection(window.webContents.id,result.content);if(result.content.type==='image')preview=result.content.data;matches=await this.deps.matches(window.webContents.id,input);}
   if(generation!==this.generation)return;
   this.target=result.target;this.platform.remember(result.target);this.issue=result.issue;this.input=input;this.matches=matches;this.preview=preview;
   this.loading=false;const area=screen.getDisplayNearestPoint(point).workArea;window.setBounds(panelBounds(point,area));this.changed();
   window.setAlwaysOnTop(true,'pop-up-menu');
   if(mode==='keyboard'||this.pendingRelease)revealWindow(window);else window.showInactive();
   this.deps.changed();
   if(this.pendingRelease)this.release(this.pendingRelease,true);
  }catch(error){if(generation!==this.generation)return;this.loading=false;this.input=null;this.matches=[];this.issue=(error as Error).message;const window=await this.ensure();if(generation!==this.generation)return;window.setBounds(panelBounds(point,screen.getDisplayNearestPoint(point).workArea));this.changed();mode==='keyboard'?revealWindow(window):window.showInactive();this.deps.changed();}
 }
 async launch(id:string){
  const window=this.window;if(!window||this.loading||this.executing)return;
  this.executing=true;
  try{await this.deps.execute(window,id,this.input);this.hide(false);}catch(error){this.issue=(error as Error).message;this.changed();revealWindow(window);}finally{this.executing=false;}
 }
 async toLauncher(){const window=this.window;if(!window||this.loading||this.executing)return;this.executing=true;try{await this.deps.toLauncher(window,this.input);this.hide(false);}finally{this.executing=false;}}
 clear(){if(this.window)this.inputs.clear(this.window.webContents.id);this.input=null;this.preview=undefined;this.matches=[];this.issue=undefined;this.changed();}
 focus(){if(this.window?.isVisible())revealWindow(this.window);}
 release(point:{x:number;y:number},quick:boolean){
  if(this.loading){this.pendingRelease=point;return;}
  const window=this.window;if(!window?.isVisible())return;
  const bounds=window.getBounds(),inside=point.x>=bounds.x&&point.x<=bounds.x+bounds.width&&point.y>=bounds.y&&point.y<=bounds.y+bounds.height;
  if(!inside){this.hide(false);return;}
  if(quick){this.focus();return;}
  window.webContents.send('host-change','panel-release:'+JSON.stringify({x:point.x-bounds.x,y:point.y-bounds.y}));
 }
 pointerDown(point:{x:number;y:number}){const window=this.window;if(!window?.isVisible()||this.loading||this.executing)return;const b=window.getBounds();if(point.x<b.x||point.x>b.x+b.width||point.y<b.y||point.y>b.y+b.height)this.hide(false);}
 move(point:{x:number;y:number}){const window=this.window;if(!window?.isVisible()||this.loading)return;const b=window.getBounds();window.webContents.send('host-change','panel-move:'+JSON.stringify({x:point.x-b.x,y:point.y-b.y}));}
 hide(restore=true){
  ++this.generation;this.selection.cancel();this.loading=false;const window=this.window;
  if(!window||window.isDestroyed())return;const hadFocus=window.isFocused();window.hide();this.inputs.clear(window.webContents.id);this.input=null;this.preview=undefined;this.matches=[];
  if(restore&&hadFocus&&!BrowserWindow.getFocusedWindow())void this.platform.restoreFocus(this.target);this.deps.changed();
 }
 refresh(){this.changed();}
 close(){this.hide(false);this.window?.destroy();}
}
