import koffi from 'koffi';
import { nativeImage } from 'electron';

function bindings() {
  const shell = koffi.load('shell32.dll'), user = koffi.load('user32.dll'), gdi = koffi.load('gdi32.dll');
  return {
    extract: shell.func('int32_t __stdcall SHDefExtractIconW(str16, int32_t, uint32_t, _Out_ uintptr_t *, void *, uint32_t)'),
    destroy: user.func('int32_t __stdcall DestroyIcon(uintptr_t)'),
    draw: user.func('int32_t __stdcall DrawIconEx(uintptr_t, int32_t, int32_t, uintptr_t, int32_t, int32_t, uint32_t, uintptr_t, uint32_t)'),
    createDC: gdi.func('uintptr_t __stdcall CreateCompatibleDC(uintptr_t)'),
    deleteDC: gdi.func('int32_t __stdcall DeleteDC(uintptr_t)'),
    createBitmap: gdi.func('uintptr_t __stdcall CreateDIBSection(uintptr_t, const void *, uint32_t, _Out_ void **, uintptr_t, uint32_t)'),
    select: gdi.func('uintptr_t __stdcall SelectObject(uintptr_t, uintptr_t)'),
    deleteBitmap: gdi.func('int32_t __stdcall DeleteObject(uintptr_t)'),
    fill: gdi.func('int32_t __stdcall PatBlt(uintptr_t, int32_t, int32_t, int32_t, int32_t, uint32_t)'),
    flush: gdi.func('int32_t __stdcall GdiFlush()'),
  };
}
let native: ReturnType<typeof bindings> | undefined;

/** Extract the actual resource, without Electron/Windows' file-type icon cache. */
export async function loadWindowsResourceIcon(file: string, index = 0): Promise<string> {
  if (process.platform !== 'win32') return '';
  const api = native ??= bindings();
  const icon: (number | bigint)[] = [0];
  let dc: number | bigint = 0, bitmap: number | bigint = 0, previous: number | bigint = 0;
  try {
    // Resource extraction may touch a large executable; keep it off the main thread.
    const result = await new Promise<number>((resolve, reject) => {
      api.extract.async(file, index, 0, icon, null, 32, (error: Error | null, value: number) => error ? reject(error) : resolve(value));
    });
    if (result !== 0 || !icon[0]) return '';
    dc = api.createDC(0);
    if (!dc) return '';
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0); header.writeInt32LE(32, 4); header.writeInt32LE(-32, 8);
    header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14);
    const bits: unknown[] = [null];
    bitmap = api.createBitmap(dc, header, 0, bits, 0, 0);
    if (!bitmap || !bits[0]) return '';
    previous = api.select(dc, bitmap);
    if (!previous) return '';
    const render = (background: number): Buffer => {
      if (!api.fill(dc, 0, 0, 32, 32, background) || !api.draw(dc, 0, 0, icon[0], 32, 32, 0, 0, 3)) throw Error('Icon rendering failed');
      api.flush();
      return Buffer.from(koffi.decode(bits[0], 'uint8_t', 32 * 32 * 4));
    };
    // Rendering against both backgrounds handles alpha icons and legacy AND masks.
    // Black already contains premultiplied BGRA, as required by NativeImage.
    const black = render(0x00000042), white = render(0x00ff0062);
    for (let offset = 0; offset < black.length; offset += 4) {
      black[offset + 3] = 255 - Math.max(0, white[offset] - black[offset], white[offset + 1] - black[offset + 1], white[offset + 2] - black[offset + 2]);
    }
    return nativeImage.createFromBitmap(black, { width: 32, height: 32 }).toDataURL();
  } finally {
    if (previous) api.select(dc, previous);
    if (bitmap) api.deleteBitmap(bitmap);
    if (dc) api.deleteDC(dc);
    if (icon[0]) api.destroy(icon[0]);
  }
}
