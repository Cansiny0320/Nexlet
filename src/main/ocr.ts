import { t } from '../shared/i18n';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {OCR_MODELS} from '../shared/ocr';
export interface OcrJobWorker {on(event:string,callback:(value:any)=>void):unknown;terminate():unknown;}
export class OcrService {
 private stop:(()=>void)|null=null;
 constructor(private models:string,private factory:(image:Buffer)=>OcrJobWorker,private timeoutMs=60_000){}
 recognize(image:Buffer,progress:(value:number)=>void=()=>{}):Promise<string>{
  this.cancel();
  if(!image.length||image.length>20*1024*1024)return Promise.reject(Error(t("图片为空或超过 20 MB")));
  for(const file of OCR_MODELS)if(!existsSync(path.join(this.models,file)))return Promise.reject(Error(t("离线识别模型缺失，请重新安装完整的 Nexlet")));
  return new Promise((resolve,reject)=>{
   let done=false;const worker=this.factory(image);
   const finish=(error?:Error,text?:string)=>{if(done)return;done=true;clearTimeout(timer);if(this.stop===cancel)this.stop=null;void worker.terminate();error?reject(error):resolve(text||'');};
   const cancel=()=>finish(Error(t("已取消识别")));this.stop=cancel;
   const timer=setTimeout(()=>finish(Error(t("识别超过 60 秒，请缩小图片后重试"))),this.timeoutMs);
   worker.on('message',message=>{if(done)return;if(message.type==='progress')progress(Math.max(0,Math.min(1,Number(message.progress)||0)));else if(message.type==='result')finish(undefined,String(message.text).slice(0,500_000));else if(message.type==='error')finish(Error(t("文字识别失败：")+message.error));});
   worker.on('error',error=>finish(Error(t("识别进程失败：")+error.message)));worker.on('exit',()=>{if(!done)finish(Error(t("识别进程提前退出")));});
  });
 }
 cancel(){this.stop?.();}
}
