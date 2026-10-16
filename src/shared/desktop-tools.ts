import type {CaptureState} from './capture';
export interface ImageToolState {kind:'pin';image?:string;theme:string;}
export type DesktopToolState=({kind:'capture'}&CaptureState)|ImageToolState;
export interface DesktopApi {call<T=unknown>(action:string,payload?:unknown):Promise<T>;onChange(callback:()=>void):()=>void;}
declare global {interface Window {desktopTools:DesktopApi;}}
