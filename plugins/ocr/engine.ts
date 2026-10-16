import {PaddleOCR} from '@paddleocr/paddleocr-js';
import PaddleWorker from 'paddle-ocr-worker?worker';
import {RecognitionTask} from './task';
const task = new RecognitionTask();
export const cancel = () => task.cancel();
export function recognize(bytes: Uint8Array, progress: (value: number) => void) {
  return task.run(async own => {
    progress(.05);
    const engine = await PaddleOCR.create({
      worker: {createWorker: () => { const worker = new PaddleWorker(); own(worker); return worker; }},
      ocrVersion: 'PP-OCRv6',
      textDetectionModelName: 'PP-OCRv6_small_det', textRecognitionModelName: 'PP-OCRv6_small_rec',
      textDetectionModelAsset: {url: new URL('./models/PP-OCRv6_small_det_onnx_infer.tar', location.href).href},
      textRecognitionModelAsset: {url: new URL('./models/PP-OCRv6_small_rec_onnx_infer.tar', location.href).href},
      ortOptions: {backend: 'wasm', wasmPaths: new URL('./runtime/', location.href).href, numThreads: 1, proxy: false},
    });
    progress(.35);
    try {
      const result = await engine.predict(new Blob([new Uint8Array(bytes)]));
      return result[0]?.items.map(item => item.text).join('\n') || '';
    } finally { await engine.dispose(); }
  });
}
