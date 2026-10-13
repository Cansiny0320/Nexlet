import koffi from 'koffi';
import type { BrowserWindow, Event, MouseInputEvent } from 'electron';

let cocoa: ReturnType<typeof loadCocoa> | undefined;
function loadCocoa() {
  const objc = koffi.load('/usr/lib/libobjc.A.dylib');
  const cls = objc.func('void *objc_getClass(const char *)');
  const sel = objc.func('void *sel_registerName(const char *)');
  const object = objc.func('objc_msgSend', 'void *', ['void *', 'void *']);
  const integer = objc.func('objc_msgSend', 'uintptr_t', ['void *', 'void *']);
  const send = objc.func('objc_msgSend', 'void', ['void *', 'void *', 'void *']);
  const release = objc.func('objc_msgSend', 'void', ['void *', 'void *']);
  const selectors = Object.fromEntries(['sharedApplication', 'currentEvent', 'window', 'type', 'retain', 'release', 'performWindowDragWithEvent:'].map(name => [name, sel(name)]));
  return { cls, object, integer, send, release, selectors };
}

// Retain the actual mouse-down event before Chromium dispatches it. AppKit hands
// the drag to Window Server, avoiding a renderer -> IPC -> setPosition loop.
export function nativeWindowDrag(window: BrowserWindow): () => boolean {
  if (process.platform !== 'darwin') return () => false;
  const api = cocoa ??= loadCocoa(), s = api.selectors;
  const application = api.object(api.cls('NSApplication'), s.sharedApplication);
  const contents = window.webContents;
  const nativeWindow = api.object(window.getNativeWindowHandle().readBigUInt64LE(), s.window);
  let down: unknown = null, dragging = false;
  const clear = () => { if (down) api.release(down, s.release); down = null; dragging = false; };
  const mouse = (_event: Event, input: MouseInputEvent) => {
    if (input.type === 'mouseDown') {
      clear();
      if (input.button !== 'left') return;
      const event = api.object(application, s.currentEvent);
      if (event && Number(api.integer(event, s.type)) === 1 && api.object(event, s.window) === nativeWindow) down = api.object(event, s.retain);
    } else if (input.type === 'mouseUp') clear();
  };
  contents.on('before-mouse-event', mouse);
  window.on('blur', clear);
  window.once('closed', () => { clear(); contents.off('before-mouse-event', mouse); window.off('blur', clear); });
  return () => {
    if (dragging) return true;
    // Track this window's mouse-up rather than the global button state, which
    // excludes events delivered by accessibility tools.
    if (!down) return false;
    api.send(nativeWindow, s['performWindowDragWithEvent:'], down);
    api.release(down, s.release);
    down = null;
    dragging = true;
    return true;
  };
}
