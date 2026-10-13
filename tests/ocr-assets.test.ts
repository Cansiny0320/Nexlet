import {it,expect} from 'vitest';
import {ocrAssetPath} from '../src/main/ocr-assets';
it('serves only bundled OCR assets and fixed model files',()=>{
 expect(ocrAssetPath('nexlet-ocr://engine/ocr.html','/renderer','/models')).toBe('/renderer/ocr.html');
 expect(ocrAssetPath('nexlet-ocr://engine/assets/ocr-ab123.js','/renderer','/models')).toBe('/renderer/assets/ocr-ab123.js');
 expect(ocrAssetPath('nexlet-ocr://engine/assets/ort.wasm.min-abc.js','/renderer','/models')).toBe('/renderer/assets/ort.wasm.min-abc.js');
 expect(ocrAssetPath('nexlet-ocr://engine/models/PP-OCRv6_small_rec_onnx_infer.tar','/renderer','/models')).toBe('/models/PP-OCRv6_small_rec_onnx_infer.tar');
 for(const url of ['https://example.com/assets/ocr.js','nexlet-ocr://other/ocr.html','nexlet-ocr://engine/../../etc/passwd','nexlet-ocr://engine/assets/%2e%2e%2fsecret.js','nexlet-ocr://engine/assets/secret.txt','nexlet-ocr://engine/models/unknown.tar','nexlet-ocr://engine/ocr.html?redirect=https://example.com','nexlet-ocr://user@engine/ocr.html'])expect(ocrAssetPath(url,'/renderer','/models')).toBeNull();
});
