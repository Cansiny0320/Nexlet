import { t } from '../shared/i18n';
import { app } from 'electron';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, access, copyFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { everythingConfig } from '../shared/everything';

const exec=promisify(execFile);
export class EverythingEngine {
  readonly instance='Nexlet-'+createHash('sha256').update(app.getPath('userData')).digest('hex').slice(0,16);
  readonly bundled=path.join(app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked'),'assets/vendor/everything');
  readonly es=path.join(this.bundled,'es.exe');
  private directory=path.join(app.getPath('userData'),'everything','1.4.1.1032');
  private engine=path.join(this.directory,'Everything.exe');
  private child:ChildProcess|null=null;
  private starting:Promise<string>|null=null;
  private stopping:Promise<void>|null=null;
  private knownVersion='1.4.1.1032';
  private stopped=false;
  private activePaths:string[]=[];
  constructor(private paths:()=>string[]){}
  get scopes(){return this.activePaths;}
  get running(){return Boolean(this.child?.pid&&this.child.exitCode===null&&this.child.signalCode===null);}
  async version():Promise<string|null>{try{const {stdout}=await exec(this.es,['-argv','-instance',this.instance,'-get-everything-version'],{windowsHide:true,timeout:1500,maxBuffer:4096,encoding:'utf8'});return stdout.trim()||null;}catch{return null;}}
  async ensure():Promise<string>{
    if(this.stopping)await this.stopping;
    if(this.stopped)throw new Error(t("文件搜索正在关闭"));
    if(this.starting)return this.starting;
    this.starting=this.start();try{return await this.starting;}finally{this.starting=null;}
  }
  private async start():Promise<string>{
    // A slow IPC response does not mean our process has stopped. In particular,
    // never copy over its executable while it is loading a large database.
    if(this.running)return this.knownVersion;
    const running=await this.version();if(running){this.knownVersion=running;return running;}
    await access(path.join(this.bundled,'Everything.exe')).catch(()=>{throw new Error(t("缺少内置 Everything 引擎，请重新下载完整的 Nexlet 安装包"));});
    let scopes=this.paths();
    if(!scopes.length){
      const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { $_.DeviceID + '\\' }) | ConvertTo-Json -Compress"],{windowsHide:true,timeout:10000,maxBuffer:32768,encoding:'utf8'});
      const value:unknown=JSON.parse(stdout.replace(/^\ufeff/,''));scopes=(Array.isArray(value)?value:[value]).filter((p):p is string=>typeof p==='string'&&/^[a-z]:\\$/i.test(p));
    }
    if(!scopes.length)throw new Error(t("未找到可索引的磁盘，请添加索引目录"));
    this.activePaths=scopes;
    await mkdir(this.directory,{recursive:true});
    try{await access(this.engine);}catch(e){
      if((e as NodeJS.ErrnoException).code!=='ENOENT')throw new Error(t("无法访问内置搜索引擎，请检查数据目录权限后重试。"));
      try{await copyFile(path.join(this.bundled,'Everything.exe'),this.engine,constants.COPYFILE_EXCL);}catch(copyError){
        if((copyError as NodeJS.ErrnoException).code!=='EEXIST')throw new Error(t("无法准备内置搜索引擎，文件可能正被占用，请稍后重试。"));
      }
    }
    const config=path.join(this.directory,'Everything.ini');await writeFile(config,everythingConfig(scopes));
    const child=spawn(this.engine,['-instance',this.instance,'-config',config,'-db',path.join(this.directory,'Everything.db'),'-startup'],{windowsHide:true,stdio:'ignore'});this.child=child;
    let failed:Error|null=null;child.on('error',e=>{failed=e;});child.on('exit',()=>{if(this.child===child)this.child=null;});
    for(let i=0;i<24;i++){
      if(failed)throw failed;if(child.exitCode!==null)throw new Error(t("Everything 引擎未能启动，请重试"));
      if(this.stopped)throw new Error(t("文件搜索已关闭"));
      const version=await this.version();if(version){this.knownVersion=version;return version;}
      await new Promise(r=>setTimeout(r,200));
    }
    // Loading a large existing database can outlast the IPC startup window.
    // Keep the owned process and let the readiness probe report preparation.
    if(this.running)return this.knownVersion;
    throw new Error(t("Everything 引擎启动超时，请重试"));
  }
  async stop(permanent=false):Promise<void>{
    this.stopped=permanent;
    if(this.stopping)return this.stopping;
    this.stopping=this.stopProcess();try{await this.stopping;}finally{this.stopping=null;}
  }
  private async stopProcess():Promise<void>{
    await this.starting?.catch(()=>{});
    if(!this.child&&!(await this.version()))return;
    await exec(this.engine,['-instance',this.instance,'-exit'],{windowsHide:true,timeout:5000,maxBuffer:4096}).catch(()=>{});
    const child=this.child;
    if(child&&child.exitCode===null){await Promise.race([new Promise<void>(r=>child.once('exit',()=>r())),new Promise<void>(r=>setTimeout(r,2000))]);if(child.exitCode===null)child.kill();}
    this.child=null;
  }
}
