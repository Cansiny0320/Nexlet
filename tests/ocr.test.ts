import {it,expect,vi,afterEach} from 'vitest';
import {RecognitionTask} from '../plugins/ocr/task';
afterEach(() => vi.useRealTimers());
it('cancels previous recognition and ignores its late result', async () => {
 const task = new RecognitionTask(), worker = {terminate:vi.fn()}; let complete!: (text:string)=>void;
 const first = task.run(own => {own(worker);return new Promise<string>(resolve => complete=resolve);}).catch(e=>e.message);
 await Promise.resolve(); const second = task.run(async ()=>'new text'); complete('stale');
 expect(await first).toBe('cancelled'); expect(await second).toBe('new text'); expect(worker.terminate).toHaveBeenCalledOnce();
});
it('preserves empty results and terminates the worker',async()=>{
 const task=new RecognitionTask(),worker={terminate:vi.fn()};
 expect(await task.run(async own=>{own(worker);return '';})).toBe('');expect(worker.terminate).toHaveBeenCalledOnce();
});
it('timeout and worker errors reject and clean up',async()=>{
 vi.useFakeTimers();const task=new RecognitionTask(),worker={terminate:vi.fn()};
 const result=task.run(own=>{own(worker);return new Promise(()=>{});},50).catch(e=>e.message);
 await vi.advanceTimersByTimeAsync(51);expect(await result).toBe('timeout');expect(worker.terminate).toHaveBeenCalledOnce();
 await expect(task.run(async()=>{throw Error('worker crash');})).rejects.toThrow('worker crash');
});
it('cancellation before initialization still terminates a late worker',async()=>{
 const task=new RecognitionTask(),worker={terminate:vi.fn()};let start!:()=>void;
 const result=task.run(async own=>{await new Promise<void>(resolve=>start=resolve);own(worker);return 'late';}).catch(e=>e.message);
 await Promise.resolve();task.cancel();start();expect(await result).toBe('cancelled');await Promise.resolve();expect(worker.terminate).toHaveBeenCalledOnce();
});
