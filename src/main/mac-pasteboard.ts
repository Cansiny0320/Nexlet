import koffi from 'koffi';

// Keep AppKit loaded for the lifetime of the Objective-C classes used below.
let appKit: ReturnType<typeof koffi.load> | undefined;

/** Read metadata only; no clipboard contents or helper processes are involved. */
export function createMacPasteboardReader(): () => number {
  appKit ??= koffi.load('/System/Library/Frameworks/AppKit.framework/AppKit');
  const objc = koffi.load('/usr/lib/libobjc.A.dylib');
  const getClass = objc.func('void *objc_getClass(const char *name)');
  const selector = objc.func('void *sel_registerName(const char *name)');
  // objc_msgSend must use the concrete method signature, not a variadic ABI.
  // NSInteger is pointer-sized on both supported macOS architectures.
  const objectMessage = objc.func('objc_msgSend', 'void *', ['void *', 'void *']);
  const integerMessage = objc.func('objc_msgSend', 'intptr_t', ['void *', 'void *']);
  const voidMessage = objc.func('objc_msgSend', 'void', ['void *', 'void *']);
  const pasteboardClass = getClass('NSPasteboard'),
    poolClass = getClass('NSAutoreleasePool');
  if (!pasteboardClass || !poolClass) throw Error('AppKit pasteboard classes unavailable');
  const general = selector('generalPasteboard'),
    changeCount = selector('changeCount');
  const alloc = selector('alloc'),
    init = selector('init'),
    drain = selector('drain');
  return () => {
    const pool = objectMessage(objectMessage(poolClass, alloc), init);
    if (!pool) throw Error('Could not create pasteboard autorelease pool');
    try {
      const pasteboard = objectMessage(pasteboardClass, general);
      if (!pasteboard) throw Error('General pasteboard unavailable');
      const value = Number(integerMessage(pasteboard, changeCount));
      if (!Number.isSafeInteger(value)) throw Error('Invalid pasteboard change count');
      return value;
    } finally {
      voidMessage(pool, drain);
    }
  };
}
