import './style.css';
import {recognize, cancel} from './engine';
import type {} from '../../sdk';
const words = {
 'zh-CN': {pick:'选择图片',capture:'截图识别',rotate:'旋转',run:'识别文字',stop:'停止识别',original:'原图',result:'识别结果',search:'继续搜索',copy:'复制文字',detach:'独立窗口',drop:'选择或拖入图片\n也可以直接粘贴截图\nPNG、JPEG、WebP、BMP · 最大 20 MB',idle:'图片在本机处理',running:'正在识别…',done:'识别完成',empty:'没有识别到文字，请换用更清晰的图片或缩小截图范围',changed:'识别期间剪贴板已改变，结果已保留，请按需复制',copied:'文字已复制',cancelled:'已取消识别',timeout:'识别超时，请缩小图片后重试',invalid:'请选择不超过 20 MB、3600 万像素的有效图片'},
 en: {pick:'Choose image',capture:'Capture text',rotate:'Rotate',run:'Recognize',stop:'Stop',original:'Original',result:'Recognized text',search:'Continue searching',copy:'Copy text',detach:'Separate window',drop:'Choose or drop an image\nYou can also paste a screenshot\nPNG, JPEG, WebP, BMP · Up to 20 MB',idle:'Images are processed locally',running:'Recognizing…',done:'Recognition complete',empty:'No text found. Use a clearer image or a smaller capture area.',changed:'Clipboard changed during recognition. The result is available to copy.',copied:'Text copied',cancelled:'Recognition cancelled',timeout:'Recognition timed out. Try a smaller image.',invalid:'Choose a valid image up to 20 MB and 36 million pixels'},
 'zh-Hant': {pick:'選擇圖片',capture:'截圖辨識',rotate:'旋轉',run:'辨識文字',stop:'停止辨識',original:'原圖',result:'辨識結果',search:'繼續搜尋',copy:'複製文字',detach:'獨立視窗',drop:'選擇或拖入圖片\n也可以直接貼上截圖\nPNG、JPEG、WebP、BMP · 最大 20 MB',idle:'圖片在本機處理',running:'正在辨識…',done:'辨識完成',empty:'沒有辨識到文字，請換用更清晰的圖片或縮小截圖範圍',changed:'辨識期間剪貼簿已變更，結果已保留，請按需複製',copied:'文字已複製',cancelled:'已取消辨識',timeout:'辨識逾時，請縮小圖片後重試',invalid:'請選擇不超過 20 MB、3600 萬像素的有效圖片'},
};
let locale: keyof typeof words = 'zh-CN', bytes: Uint8Array | undefined, url = '', generation = 0, running = false;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const result = $<HTMLTextAreaElement>('result'), file = $<HTMLInputElement>('file');
const status = (key: string) => { $('status').textContent = words[locale][key as keyof typeof words.en] || key; };
function controls() {
 for (const id of ['run','rotate']) $<HTMLButtonElement>(id).disabled = !bytes || running;
 for (const id of ['copy','search']) $<HTMLButtonElement>(id).disabled = !result.value.trim() || running;
 $('stop').hidden = !running; $('run').hidden = running; $('progress').hidden = !running; result.readOnly = running;
}
function stop() { ++generation; cancel(); running = false; controls(); status('cancelled'); }
function language(value: keyof typeof words) {
 locale = words[value] ? value : 'en'; document.documentElement.lang = locale;
 document.querySelectorAll<HTMLElement>('[data-t]').forEach(el => el.textContent = words[locale][el.dataset.t as keyof typeof words.en]);
 result.setAttribute('aria-label', words[locale].result); status(running ? 'running' : 'idle');
}
async function run(copy = false) {
 if (!bytes) return;
 stop(); const current = generation; running = true; result.value = ''; controls(); status('running');
 try {
  const snapshot = copy ? await nexlet.clipboard.snapshot() : null;
  if (generation !== current) return;
  const text = await recognize(bytes, value => { if (generation === current) $<HTMLProgressElement>('progress').value = value; });
  if (generation !== current) return;
  result.value = text; status(text ? 'done' : 'empty');
  if (copy && text) {
   const copied = snapshot !== null && await nexlet.clipboard.writeTextIfUnchanged(snapshot, text);
   if (generation !== current) return;
   status(copied ? 'copied' : 'changed');
  }
 } catch (error) { if (generation === current) status(error instanceof Error ? error.message : String(error)); }
 finally { if (generation === current) { running = false; controls(); } }
}
async function load(data: Uint8Array, copy = false) {
 stop(); const current = generation;
 try {
 if (!data.length || data.length > 20 * 1024 * 1024) throw Error(words[locale].invalid);
 const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)])).catch(() => { throw Error(words[locale].invalid); });
 const valid = bitmap.width * bitmap.height <= 36_000_000; bitmap.close();
 if (!valid) throw Error(words[locale].invalid);
 if (generation !== current) return;
 bytes = data; if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(new Blob([new Uint8Array(data)]));
 $<HTMLImageElement>('image').src = url; $('image').hidden = false; $('drop').hidden = true;
 await run(copy);
 } catch(error) { if (generation === current) status(error instanceof Error ? error.message : String(error)); }
}
const safely = (work: () => Promise<unknown>) => { void work().catch(error => status(error.message || String(error))); };
async function loadFile(file: File) {
 stop(); const current = generation;
 if (file.size > 20 * 1024 * 1024) { status('invalid'); return; }
 const data = await file.arrayBuffer();
 if (generation === current) await load(new Uint8Array(data));
}
async function capture(copy = false) {
 stop(); const current = generation;
 await nexlet.window.hide();
 let image;
 try {
  const displays = await nexlet.screen.displays();
  const cursor = await nexlet.screen.cursor().catch(() => null);
  const display = displays.find(({bounds:b}) => cursor && cursor.x >= b.x && cursor.x < b.x+b.width && cursor.y >= b.y && cursor.y < b.y+b.height) || displays[0];
  image = await nexlet.screen.select({id:'ocr-capture',timeoutMs:60000,displayId:display?.id});
 } finally { await nexlet.window.show(); }
 if (image && generation === current) await load(image.data, copy);
}
$('pick').onclick = $('drop').onclick = () => file.click();
file.onchange = () => { const selected = file.files?.[0]; file.value = ''; if (selected) safely(() => loadFile(selected)); };
$('capture').onclick = () => safely(() => capture()); $('run').onclick = () => safely(() => run()); $('stop').onclick = stop;
$('copy').onclick = () => safely(async () => { await nexlet.clipboard.writeText(result.value); status('copied'); });
$('search').onclick = () => safely(() => nexlet.search.returnToLauncher(result.value));
$('detach').onclick = () => safely(() => nexlet.window.detach());
$('rotate').onclick = () => safely(async () => {
 if (!bytes) return; stop(); const current = generation;
 const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
 const canvas = document.createElement('canvas'); canvas.width = bitmap.height; canvas.height = bitmap.width;
 const context = canvas.getContext('2d')!; context.translate(canvas.width,0); context.rotate(Math.PI/2); context.drawImage(bitmap,0,0); bitmap.close();
 const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'));
 if (generation !== current) return;
 bytes = new Uint8Array(await blob.arrayBuffer()); URL.revokeObjectURL(url); url = URL.createObjectURL(blob); $<HTMLImageElement>('image').src = url; controls();
});
result.oninput = controls;
document.ondragover = event => event.preventDefault();
document.ondrop = event => { event.preventDefault(); const image = event.dataTransfer?.files[0]; if (image) safely(() => loadFile(image)); };
document.onpaste = event => { const image = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'))?.getAsFile(); if (image) { event.preventDefault(); safely(() => loadFile(image)); } };
document.onkeydown = event => { if (event.key === 'Escape') stop(); };
nexlet.onOut(() => { stop(); void nexlet.tasks.cancel('ocr-capture').catch(() => {}); });
nexlet.onEnter(context => {
 stop(); const current = generation;
 void (async () => {
  language(await nexlet.i18n.getLocale());
  if (generation !== current) return;
  if (context.code.startsWith('capture')) { await capture(context.code === 'capture-copy'); return; }
  const resource = context.type === 'image' ? context.payload : context.type === 'files' ? context.payload[0] : null;
  if (resource) { const data = await nexlet.input.read(resource.id); if (generation === current) await load(data, context.code === 'copy'); }
  else if (context.code === 'copy') { const image = await nexlet.clipboard.readImage(); if (image && generation === current) await load(image, true); }
 })().catch(error => { if (generation === current) status(error.message || String(error)); });
});
nexlet.i18n.onChange(language); language(locale);
