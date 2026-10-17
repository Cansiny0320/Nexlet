import { EventEmitter } from 'node:events';
import { afterEach, expect, test, vi } from 'vite-plus/test';
import type { BrowserWindow } from 'electron';

const native = vi.hoisted(() => ({ release: vi.fn(), drag: vi.fn() }));
vi.mock('koffi', () => ({
  default: {
    load: () => ({
      func: (name: string, result?: string) => {
        if (name.includes('objc_getClass') || name.includes('sel_registerName'))
          return (value: string) => value;
        if (result === 'void *')
          return (receiver: unknown, selector: string) =>
            selector === 'currentEvent' ? 2n : selector === 'window' ? 3n : receiver;
        if (result === 'uintptr_t') return () => 1;
        return (receiver: unknown, selector: string, event?: unknown) =>
          selector === 'release' ? native.release(receiver) : native.drag(receiver, event);
      },
    }),
  },
}));
import { nativeWindowDrag } from '../src/main/window-drag';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function setup() {
  vi.stubGlobal('process', { ...process, platform: 'darwin' });
  const window = new EventEmitter(),
    contents = new EventEmitter();
  let destroyed = false;
  Object.defineProperty(window, 'webContents', {
    get() {
      if (destroyed) throw Error('Object has been destroyed');
      return contents;
    },
  });
  Object.assign(window, { getNativeWindowHandle: () => Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]) });
  return {
    window,
    contents,
    start: nativeWindowDrag(window as BrowserWindow),
    destroy() {
      destroyed = true;
      window.emit('closed');
    },
  };
}
test('关闭窗口后用已保存的 webContents 清理，不访问销毁后的 BrowserWindow', () => {
  const probe = setup();
  probe.contents.emit('before-mouse-event', {}, { type: 'mouseDown', button: 'left' });
  expect(() => probe.destroy()).not.toThrow();
  expect(probe.contents.listenerCount('before-mouse-event')).toBe(0);
  expect(native.release).toHaveBeenCalledExactlyOnceWith(2n);
});
test('原生拖动只交接一次，并释放保留的鼠标事件', () => {
  const probe = setup();
  probe.contents.emit('before-mouse-event', {}, { type: 'mouseDown', button: 'left' });
  expect(probe.start()).toBe(true);
  expect(probe.start()).toBe(true);
  expect(native.drag).toHaveBeenCalledExactlyOnceWith(3n, 2n);
  expect(native.release).toHaveBeenCalledExactlyOnceWith(2n);
  probe.destroy();
  expect(native.release).toHaveBeenCalledTimes(1);
});
test('鼠标已松开或没有原生按下事件时，不接管窗口', () => {
  const probe = setup();
  expect(probe.start()).toBe(false);
  probe.contents.emit('before-mouse-event', {}, { type: 'mouseDown', button: 'left' });
  probe.contents.emit('before-mouse-event', {}, { type: 'mouseUp' });
  expect(probe.start()).toBe(false);
  expect(native.drag).not.toHaveBeenCalled();
  expect(native.release).toHaveBeenCalledExactlyOnceWith(2n);
  probe.destroy();
});
