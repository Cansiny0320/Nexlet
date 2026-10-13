import {PaddleOCR} from '@paddleocr/paddleocr-js';
import {OCR_MODELS,type OcrMessage} from '../shared/ocr';
declare global{interface Window{ocrEngine:{start(callback:(image:Uint8Array)=>void):void;report(message:OcrMessage):void;}}}
window.ocrEngine.start(image=>{void recognize(image);});
async function recognize(image:Uint8Array){
 try{
  window.ocrEngine.report({type:'progress',progress:.05});
  const engine=await PaddleOCR.create({worker:false,ocrVersion:'PP-OCRv6',
   textDetectionModelName:'PP-OCRv6_small_det',textRecognitionModelName:'PP-OCRv6_small_rec',
   textDetectionModelAsset:{url:new URL('/models/'+OCR_MODELS[0],location.href).href},
   textRecognitionModelAsset:{url:new URL('/models/'+OCR_MODELS[1],location.href).href},
   ortOptions:{backend:'wasm',wasmPaths:new URL('/runtime/',location.href).href,numThreads:1,proxy:false},
  });
  window.ocrEngine.report({type:'progress',progress:.35});
  const result=await engine.predict(new Blob([new Uint8Array(image)],{type:'image/png'}));
  const text=result[0]?.items.map(item=>item.text).join('\n')||'';
  await engine.dispose();
  window.ocrEngine.report({type:'result',text});
 }catch(error){window.ocrEngine.report({type:'error',error:error instanceof Error?error.message:String(error)});}
}
