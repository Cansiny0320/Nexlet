import { mkdir,writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
// Code-native N mark. Supersampling keeps the icon sharp at small desktop sizes.
const crc=b=>{let c=0xffffffff;for(const n of b){c^=n;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
const chunk=(name,data)=>{const type=Buffer.from(name),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([size,type,data,sum]);};
function png(size){const raw=Buffer.alloc(size*(size*4+1));for(let y=0;y<size;y++)for(let x=0;x<size;x++){let alpha=0,n=0;for(let sy=0;sy<3;sy++)for(let sx=0;sx<3;sx++){const u=(x+(sx+.5)/3)/size,v=(y+(sy+.5)/3)/size;const dx=Math.max(.19-u,0,u-.81),dy=Math.max(.19-v,0,v-.81);if(Math.hypot(dx,dy)<.155){alpha++;if((u>.28&&u<.38&&v>.25&&v<.75)||(u>.62&&u<.72&&v>.25&&v<.75)||(v>.25&&v<.75&&Math.abs(u-(.33+(v-.25)*.68))<.058))n++;}}
const at=y*(size*4+1)+1+x*4,shade=y/size;for(let c=0;c<3;c++){const base=[106-30*shade,105-30*shade,238-14*shade][c];raw[at+c]=alpha?Math.round((base*(alpha-n)+255*n)/alpha):0;}raw[at+3]=Math.round(alpha/9*255);}
const h=Buffer.alloc(13);h.writeUInt32BE(size,0);h.writeUInt32BE(size,4);h[8]=8;h[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
await mkdir('assets',{recursive:true});const small=png(256),large=png(512);await writeFile('assets/icon.png',large);const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(small.length,14);ico.writeUInt32LE(22,18);await writeFile('assets/icon.ico',Buffer.concat([ico,small]));
