import {build} from 'vite';
import {readFile, readdir, mkdir, cp, copyFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import AdmZip from 'adm-zip';
const root = fileURLToPath(new URL('../plugins/ocr/', import.meta.url));
const dist = path.join(root, 'dist');
const modelRoot = path.join(root, 'models');
const manifest = JSON.parse(await readFile(path.join(modelRoot,'manifest.json'),'utf8'));
for (const item of manifest.files) {
 const data = await readFile(path.join(modelRoot,item.file));
 if (data.length !== item.bytes || createHash('sha256').update(data).digest('hex') !== item.sha256) throw Error('OCR model missing or damaged: '+item.file);
}
const engine = path.join(root,'node_modules/@paddleocr/paddleocr-js/dist/assets');
const worker = (await readdir(engine)).find(name => /^worker-entry-.*\.js$/.test(name));
if (!worker) throw Error('PaddleOCR worker entry missing');
await build({configFile:false,root,base:'./',resolve:{conditions:['onnxruntime-web-use-extern-wasm','module','browser','production'],alias:[{find:/^paddle-ocr-worker(?=\?|$)/,replacement:path.join(engine,worker)},{find:/^onnxruntime-web$/,replacement:path.join(root,'node_modules/onnxruntime-web/dist/ort.wasm.min.mjs')}]},worker:{format:'es'},build:{outDir:dist,emptyOutDir:true}});
await cp(modelRoot,path.join(dist,'models'),{recursive:true});
await copyFile(path.join(root,'plugin.json'),path.join(dist,'plugin.json'));
await mkdir(path.join(dist,'runtime'),{recursive:true});
for (const ext of ['mjs','wasm']) await copyFile(path.join(root,'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.'+ext),path.join(dist,'runtime/ort-wasm-simd-threaded.jsep.'+ext));
const zip = new AdmZip(); zip.addLocalFolder(dist); let total = 0;
for (const item of zip.getEntries()) { const size = item.getData().length; total += size; if (size > 32*1024*1024) throw Error('Plugin file exceeds 32 MiB: '+item.entryName); }
const data = zip.toBuffer(); if (total > 128*1024*1024 || data.length > 64*1024*1024) throw Error('Plugin exceeds package limits');
const output = fileURLToPath(new URL('../release/nexlet-ocr.nexlet',import.meta.url)); await mkdir(path.dirname(output),{recursive:true}); await writeFile(output,data);
console.log(JSON.stringify({output,archiveBytes:data.length,extractedBytes:total,sha256:createHash('sha256').update(data).digest('hex')}));
