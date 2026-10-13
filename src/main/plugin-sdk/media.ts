import { utilityProcess } from 'electron';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { object, string, type SdkContext } from './context';
import type { PluginTasks } from './tasks';
import { runProcess } from './process';
export class PluginMedia {
  constructor(private tasks: PluginTasks) {}
  async invoke(context: SdkContext, method: string, value: unknown): Promise<unknown> {
    context.require('media'); const args = object(value), id = string(args.id, 100);
    return this.tasks.run(context.contents.id, id, Number(args.timeoutMs ?? 60000), async signal => {
      if (method === 'media.image') return new Promise((resolve, reject) => {
        const child = utilityProcess.fork(path.join(__dirname, 'plugin-image-worker.cjs'), [], { serviceName: 'Nexlet image processing', stdio: 'ignore' });
        const abort = () => child.kill(); signal.addEventListener('abort', abort, { once: true });
        child.once('message', message => { if (message.error) reject(new Error(message.error)); else resolve(message.value); child.kill(); });
        child.once('exit', () => { signal.removeEventListener('abort', abort); reject(new Error('图像进程已退出')); });
        child.postMessage(args);
      });
      if (method === 'media.ffmpeg') {
        context.require('files');
        if (args.executable !== undefined) context.require('process');
        const executable = args.executable === undefined ? ffmpegPath : string(args.executable);
        if (!executable) throw new Error('当前平台没有 FFmpeg 可执行文件');
        if (!Array.isArray(args.args) || args.args.some(arg => typeof arg !== 'string')) throw new Error('FFmpeg 参数无效');
        return runProcess({ executable: executable.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1'), args: ['-nostdin', '-progress', 'pipe:1', '-nostats', ...args.args], cwd: typeof args.cwd === 'string' ? args.cwd : undefined }, signal, value => context.emit('progress', { id, value }));
      }
      throw new Error('不支持的媒体 API');
    });
  }
}
