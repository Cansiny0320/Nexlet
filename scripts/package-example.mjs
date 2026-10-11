import AdmZip from 'adm-zip';
import { mkdir } from 'node:fs/promises';
await mkdir('release',{recursive:true});
const zip=new AdmZip();zip.addLocalFolder('examples/hello-nexlet');zip.writeZip('release/hello-nexlet.nexlet');
console.log('release/hello-nexlet.nexlet');
