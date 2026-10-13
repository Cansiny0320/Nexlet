export interface CommandPreference { aliases?:string[]; shortcut?:string; disabled?:boolean; captureSelection?:boolean; }
export interface LocalEntry { id:string; name:string; path:string; }
export interface CommandConfig {
  version:1; revision:number; commands:Record<string,CommandPreference>;
  localEntries:LocalEntry[]; layout:'grid'|'list'; pinned?:string[];
}
export interface ShortcutStatus { desired:string; effective:string|null; error?:string; inactive?:string; }
export const DEFAULT_PINNED=['tool:plugins','tool:clipboard','tool:scratchpad','tool:web','tool:json','tool:timestamp','tool:filesearch'];
export const MATCH_TARGETS:Record<string,string>={'match:calc':'tool:scratchpad','match:json':'tool:json','match:timestamp':'tool:timestamp','match:clipboard':'tool:clipboard','match:collect':'tool:clipboard'};
export const defaultCommandConfig=():CommandConfig=>({version:1,revision:0,commands:{},localEntries:[],layout:'grid'});
