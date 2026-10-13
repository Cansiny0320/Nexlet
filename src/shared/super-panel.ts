import type {Command} from './types';
import type {LaunchInput} from './launch';
export interface PanelCommand {kind:'command';id:string;commandId:string;}
export interface PanelFolder {kind:'folder';id:string;name:string;children:PanelCommand[];}
export type PanelItem=PanelCommand|PanelFolder;
export interface PanelConfig {version:1;revision:number;enabled:boolean;mouse:'right'|'middle'|'off';holdMs:number;shortcut:string;excludedApps:string[];items:PanelItem[];}
export interface PanelStatus {supported:boolean;mouseActive:boolean;accessibility:boolean;error:string|null;}
export interface PanelState {config:PanelConfig;status:PanelStatus;commands:Command[];matches:Command[];input:LaunchInput|null;preview?:string;issue?:string;loading:boolean;}
export const panelCommands=(items:PanelItem[]):PanelCommand[]=>items.flatMap(item=>item.kind==='folder'?item.children:[item]);
export function panelBounds(point:{x:number;y:number},area:{x:number;y:number;width:number;height:number},width=420,height=430){
 width=Math.min(width,area.width);height=Math.min(height,area.height);
 return {x:Math.round(Math.max(area.x,Math.min(point.x-width/2,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(point.y-36,area.y+area.height-height))),width,height};
}
