import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../plugins/ocr/models/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
for(const item of manifest.files){const file=new URL(item.file,root);let data=await readFile(file).catch(()=>null);if(!data&&process.argv.includes('--download')){const response=await fetch(item.url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Model download failed: '+response.status);data=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(data).digest('hex')!==item.sha256)throw Error('Model checksum mismatch: '+item.file);await writeFile(file,data);}if(!data||createHash('sha256').update(data).digest('hex')!==item.sha256)throw Error('OCR model missing or damaged: '+item.file);}
console.log('OCR models verified: '+manifest.files.map(f=>f.file).join(', '));
