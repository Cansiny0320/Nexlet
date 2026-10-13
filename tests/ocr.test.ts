import {it,expect,vi,afterEach} from 'vitest';
import {EventEmitter} from 'node:events';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {OcrService} from '../src/main/ocr';
const folders:string[]=[];afterEach(()=>{for(const p of folders.splice(0))rmSync(p,{recursive:true,force:true});vi.useRealTimers();});
function setup(timeout=60000){const models=mkdtempSync(path.join(tmpdir(),'nexlet-ocr-test-'));folders.push(models);for(const l of ['PP-OCRv6_small_det','PP-OCRv6_small_rec'])writeFileSync(path.join(models,l+'_onnx_infer.tar'),'fixture');const workers:(EventEmitter&{terminate:ReturnType<typeof vi.fn>})[]=[];const ocr=new OcrService(models,()=>{const worker=Object.assign(new EventEmitter(),{terminate:vi.fn()});workers.push(worker);return worker;},timeout);return {ocr,workers,models};}
it('cancels a previous recognition and ignores its late result',async()=>{const {ocr,workers}=setup();const first=ocr.recognize(Buffer.from('a')).catch(e=>e.message);const second=ocr.recognize(Buffer.from('b'));workers[0].emit('message',{type:'result',text:'stale'});workers[1].emit('message',{type:'result',text:'new 中文'});expect(await first).toBe('已取消识别');expect(await second).toBe('new 中文');expect(workers.every(w=>w.terminate.mock.calls.length===1)).toBe(true);});
it('reports empty recognition without manufacturing text and terminates the worker',async()=>{const {ocr,workers}=setup();const result=ocr.recognize(Buffer.from('a'));workers[0].emit('message',{type:'result',text:''});expect(await result).toBe('');expect(workers[0].terminate).toHaveBeenCalledOnce();});
it('timeout and crashed workers reject instead of hanging',async()=>{vi.useFakeTimers();const {ocr,workers}=setup(50);const p=ocr.recognize(Buffer.from('a')).catch(e=>e.message);await vi.advanceTimersByTimeAsync(51);expect(await p).toContain('超过');expect(workers[0].terminate).toHaveBeenCalledOnce();const second=ocr.recognize(Buffer.from('b')).catch(e=>e.message);workers[1].emit('exit',1);expect(await second).toContain('提前退出');});
it('fails locally when a model is missing',async()=>{const {ocr,models,workers}=setup();rmSync(path.join(models,'PP-OCRv6_small_rec_onnx_infer.tar'));await expect(ocr.recognize(Buffer.from('a'))).rejects.toThrow('模型缺失');expect(workers).toHaveLength(0);});
