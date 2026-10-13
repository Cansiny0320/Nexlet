import { BrowserWindow, desktopCapturer, screen, systemPreferences, } from 'electron';
import type { PluginTasks } from './tasks';
import { object, string, type SdkContext } from './context';

export class PluginScreen {
  constructor(private tasks: PluginTasks) {}
  async invoke(context: SdkContext, method: string, value: unknown): Promise<unknown> {
    context.require('screen');
    if (method === 'screen.displays') return screen.getAllDisplays();
    if (method === 'screen.cursor') { this.requireCoordinates(); return screen.getCursorScreenPoint(); }
    const args = object(value ?? {});
    if (method === 'screen.convertPoint') {
      const point = object(args.point); if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('坐标无效');
      if (!['dip', 'screen'].includes(String(args.to))) throw new Error('坐标目标无效'); this.requireCoordinates();
      const p = { x: Number(point.x), y: Number(point.y) };
      // Electron supplies physical/DIP conversion on Windows and X11; macOS APIs use points.
      if (process.platform === 'win32' || process.platform === 'linux') return args.to === 'dip' ? screen.screenToDipPoint(p) : screen.dipToScreenPoint(p);
      return p;
    }
    if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') === 'denied') throw new Error('需要系统屏幕录制权限');
    if (method === 'screen.sources') {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 200 }, fetchWindowIcons: true });
      return sources.map(source => ({ id: source.id, name: source.name, displayId: source.display_id, thumbnail: source.thumbnail.toDataURL(), icon: source.appIcon?.toDataURL() }));
    }
    if (method === 'screen.capture') {
      const width = Number(args.width ?? 3840), height = Number(args.height ?? 2160);
      if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 8192)) throw new Error('截图尺寸无效');
      const id = string(args.sourceId, 200), sources = await desktopCapturer.getSources({ types: [id.startsWith('screen:') ? 'screen' : 'window'], thumbnailSize: { width, height } });
      const source = sources.find(source => source.id === id); if (!source || source.thumbnail.isEmpty()) throw new Error('截图来源不存在或系统未授权');
      let image = source.thumbnail;
      if (args.region) { const r = object(args.region), rect = { x: Number(r.x), y: Number(r.y), width: Number(r.width), height: Number(r.height) }; const size = image.getSize();
        if (!Object.values(rect).every(Number.isInteger) || rect.x < 0 || rect.y < 0 || rect.width < 1 || rect.height < 1 || rect.x + rect.width > size.width || rect.y + rect.height > size.height) throw new Error('截图区域越界'); image = image.crop(rect); }
      return { data: new Uint8Array(image.toPNG()), size: image.getSize() };
    }
    if (method === 'screen.select' || method === 'screen.pickColor') {
      const id = string(args.id, 100);
      return this.tasks.run(context.contents.id, id, Number(args.timeoutMs ?? 60000), signal => this.select(args.displayId, method === 'screen.pickColor', signal));
    }
    throw new Error('不支持的屏幕 API');
  }
  private async select(displayId: unknown, color: boolean, signal: AbortSignal): Promise<unknown> {
    if (displayId === undefined) this.requireCoordinates();
    const display = displayId === undefined ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) : screen.getAllDisplays().find(d => d.id === Number(displayId));
    if (!display) throw new Error('显示器不存在');
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) } });
    const source = sources.find(s => s.display_id === String(display.id)); if (!source || source.thumbnail.isEmpty()) throw new Error('系统未提供截图');
    signal.throwIfAborted();
    const image = source.thumbnail, size = image.getSize();
    const overlay = new BrowserWindow({ ...display.bounds, show: false, frame: false, alwaysOnTop: true, skipTaskbar: true, resizable: false, movable: false, fullscreenable: false, hasShadow: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    overlay.setMenu(null); overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const html = `<html><body style="margin:0;cursor:crosshair;overflow:hidden;background:#000 0 0/100% 100%"><div id="box" style="position:fixed;border:1px solid white;background:#248aff33;pointer-events:none"></div><div style="position:fixed;top:12px;left:12px;color:white;background:#0009;padding:8px;font:14px sans-serif">${color ? '点击取色' : '拖动选择区域'} · Esc 取消</div><script>let start;const box=document.getElementById('box');document.onkeydown=e=>{if(e.key==='Escape')document.title='result:null'};document.onmousedown=e=>{start={x:e.clientX,y:e.clientY}};document.onmousemove=e=>{if(!start)return;Object.assign(box.style,{left:Math.min(start.x,e.clientX)+'px',top:Math.min(start.y,e.clientY)+'px',width:Math.abs(start.x-e.clientX)+'px',height:Math.abs(start.y-e.clientY)+'px'})};document.onmouseup=e=>{if(!start)return;document.title='result:'+JSON.stringify(${color ? '{x:e.clientX,y:e.clientY,width:1,height:1}' : '{x:Math.min(start.x,e.clientX),y:Math.min(start.y,e.clientY),width:Math.max(1,Math.abs(start.x-e.clientX)),height:Math.max(1,Math.abs(start.y-e.clientY))}'})};</script></body></html>`;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (result: unknown, error?: unknown) => { if (settled) return; settled = true; signal.removeEventListener('abort', abort); if (!overlay.isDestroyed()) overlay.destroy(); if (error) reject(error); else resolve(result); };
      const abort = () => finish(null, signal.reason);
      signal.addEventListener('abort', abort, { once: true }); overlay.once('closed', () => finish(null));
      overlay.webContents.on('page-title-updated', (event, title) => {
        event.preventDefault(); if (!title.startsWith('result:')) return;
        try {
          const region = JSON.parse(title.slice(7)); if (!region) { finish(null); return; }
          const x = Math.min(size.width - 1, Math.max(0, Math.floor(region.x * size.width / display.size.width))), y = Math.min(size.height - 1, Math.max(0, Math.floor(region.y * size.height / display.size.height)));
          if (color) {
            const pixel = image.crop({ x, y, width: 1, height: 1 }).toBitmap();
            finish({ point: { x: display.bounds.x + region.x, y: display.bounds.y + region.y }, hex: '#' + [pixel[2], pixel[1], pixel[0]].map(n => n.toString(16).padStart(2, '0')).join('') });
          } else {
            const rect = { x, y, width: Math.min(size.width - x, Math.max(1, Math.round(region.width * size.width / display.size.width))), height: Math.min(size.height - y, Math.max(1, Math.round(region.height * size.height / display.size.height))) };
            finish({ data: new Uint8Array(image.crop(rect).toPNG()), region: { x: display.bounds.x + region.x, y: display.bounds.y + region.y, width: region.width, height: region.height }, displayId: display.id });
          }
        } catch (error) { finish(null, error); }
      });
      void overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)).then(async () => {
        if (settled) return;
        await overlay.webContents.executeJavaScript(`document.body.style.backgroundImage = ${JSON.stringify('url(' + image.toDataURL() + ')')}`);
        if (!settled) { overlay.show(); overlay.focus(); }
      }).catch(error => finish(null, error));
    });
  }
  private requireCoordinates(): void { if (process.platform === 'linux' && (process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY)) throw new Error('Wayland 不支持桌面坐标查询和转换，请指定显示器'); }
}
