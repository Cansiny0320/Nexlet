import { Folder, File, FileText, FileImage, FileAudio, FileVideo, FileArchive, FileCode, AppWindow, FileSpreadsheet, Presentation } from 'lucide-react';

const groups:[string,string,string,typeof File][]=[
  ['image','图片','png jpg jpeg gif webp svg ico bmp tif tiff heic avif',FileImage],
  ['audio','音频','mp3 wav flac aac ogg m4a wma opus',FileAudio],
  ['video','视频','mp4 mkv mov avi webm wmv m4v mts m2ts',FileVideo],
  ['archive','压缩包','zip rar 7z tar gz bz2 xz tgz',FileArchive],
  ['sheet','电子表格','xls xlsx csv tsv ods',FileSpreadsheet],
  ['slides','演示文稿','ppt pptx odp key',Presentation],
  ['document','文档','pdf doc docx odt rtf txt md log epub',FileText],
  ['code','代码 / 配置','js jsx ts tsx json html css scss py rs go java c h cpp cs sh ps1 bat cmd yml yaml toml xml sql vue svelte ini',FileCode],
  ['app','应用程序','exe msi app dmg pkg deb rpm com',AppWindow],
];
export function fileKind(name:string,directory:boolean){
  if(directory)return {kind:'folder',label:'文件夹',Icon:Folder};
  const extension=name.includes('.')?name.split('.').pop()!.toLowerCase():'';
  const match=groups.find(([, ,extensions])=>extensions.split(' ').includes(extension));
  return match?{kind:match[0],label:match[1]+(extension?` (.${extension})`:''),Icon:match[3]}:{kind:'unknown',label:extension?`${extension.toUpperCase()} 文件`:'文件',Icon:File};
}
export function FileIcon({name,directory,size=24}:{name:string;directory:boolean;size?:number}){
  const {kind,label,Icon}=fileKind(name,directory);
  return <span className={'file-kind file-kind-'+kind} data-file-kind={kind} title={label}><Icon size={size} aria-hidden="true"/></span>;
}
