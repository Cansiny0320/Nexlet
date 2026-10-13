export const OCR_MODELS=['PP-OCRv6_small_det_onnx_infer.tar','PP-OCRv6_small_rec_onnx_infer.tar'] as const;
export const OCR_ENGINE_URL='nexlet-ocr://engine/ocr.html';
export type OcrMessage={type:'progress';progress:number}|{type:'result';text:string}|{type:'error';error:string};
