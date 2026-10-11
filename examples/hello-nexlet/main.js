const note=document.querySelector('#note');
const status=document.querySelector('#status');
let queue=Promise.resolve();
async function load(){try{note.value=(await window.nexlet.storage.get('note'))||'';status.textContent='已保存';}catch(e){status.textContent=e.message;}}
note.addEventListener('input',()=>{const text=note.value;status.textContent='保存中…';queue=queue.catch(()=>{}).then(()=>window.nexlet.storage.set('note',text)).then(()=>{status.textContent='已保存';}).catch(e=>{status.textContent=e.message;});});
document.querySelector('#copy').addEventListener('click',async()=>{try{await window.nexlet.clipboard.writeText(note.value);status.textContent='已复制';}catch(e){status.textContent=e.message;}});
void load();
