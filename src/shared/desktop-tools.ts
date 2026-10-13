import type {CaptureState} from './capture';
export interface ImageToolState {kind:'pin'|'ocr';image?:string;text:string;phase:'idle'|'running'|'done'|'error';progress:number;error?:string;copied?:boolean;theme:string;}
export type DesktopToolState=({kind:'capture'}&CaptureState)|ImageToolState;
export interface DesktopApi {call<T=unknown>(action:string,payload?:unknown):Promise<T>;onChange(callback:()=>void):()=>void;pathForFile(file:File):string;}
declare global {interface Window {desktopTools:DesktopApi;}}
