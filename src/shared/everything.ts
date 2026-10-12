import path from 'node:path';

export interface FileResult { path:string;name:string;parent:string;size:number|null;modified:string;directory:boolean; }
export interface FileInfo extends FileResult { created:string; }
export interface DirectoryPage { path:string;parent:string|null;ancestors:{path:string;name:string}[];items:FileResult[];cursor:string|null; }
export interface FileSearchIndexStatus { status:'preparing'|'ready'|'unavailable'|'unsupported';message:string;startedAt:number;version?:string;scopes?:string[]; }
export interface FileSearchResult { status:'idle'|'ready'|'indexing'|'unavailable'|'unsupported';message:string;items:FileResult[];limited:boolean;version?:string;scopes?:string[]; }
export function everythingConfig(scopes:string[]):string{
  if(!scopes.length||scopes.length>26||scopes.some(p=>!path.win32.isAbsolute(p)||/[\0\r\n]/.test(p)))throw new Error('索引目录无效');
  return ['[Everything]','app_data=0','run_as_admin=0','run_in_background=1','show_tray_icon=0','check_for_updates_on_startup=0','search_history_enabled=0','run_history_enabled=0','auto_include_fixed_volumes=0','auto_include_removable_volumes=0','auto_include_fixed_refs_volumes=0','auto_include_removable_refs_volumes=0','ntfs_volume_includes=','refs_volume_includes=','http_server_enabled=0','etp_server_enabled=0','index_size=1','index_date_modified=1','index_attributes=1','folders='+scopes.map(p=>JSON.stringify(p)).join(','),'folder_monitor_changes='+scopes.map(()=>1).join(','),'folder_update_types='+scopes.map(()=>1).join(','),'folder_update_intervals='+scopes.map(()=>60).join(','),'folder_update_interval_types='+scopes.map(()=>0).join(','),''].join('\r\n');
}
export function everythingArguments(query:string,output:string,instance=''):string[]{
  if(typeof query!=='string'||query.length>1024||/[\0\r\n]/.test(query))throw new Error('搜索内容最多 1024 字符，且不能包含换行');
  return ['-argv',...(instance?['-instance',instance]:[]),'-timeout','1500','-n','200','-full-path-and-name','-size','-date-modified','-attributes','-size-format','1','-date-format','1','-no-digit-grouping','-export-json',output,'--',query];
}
export function parseEverythingResults(text:string):FileResult[]{
  if(text.length>2*1024*1024)throw new Error('Everything 返回结果过大');
  // ES successfully exports an empty file (rather than []) for zero matches.
  if(!text.replace(/^\ufeff/,'').trim())return [];
  const rows:unknown=JSON.parse(text.replace(/^\ufeff/,''));
  if(!Array.isArray(rows)||rows.length>200)throw new Error('Everything 返回格式无效');
  return rows.map(row=>{
    if(!row||typeof row!=='object'||typeof row.filename!=='string'||!path.win32.isAbsolute(row.filename)||row.filename.length>32767||/[\0\r\n]/.test(row.filename))throw new Error('Everything 返回路径无效');
    const filename=path.win32.normalize(row.filename),directory=(Number(row.attributes)&16)!==0||/[\\/]$/.test(row.filename);
    return {path:filename,name:path.win32.basename(filename)||filename,parent:path.win32.dirname(filename),directory,size:typeof row.size==='number'&&row.size>=0?row.size:null,modified:typeof row.date_modified==='string'?row.date_modified:''};
  });
}
