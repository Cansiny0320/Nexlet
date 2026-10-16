import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import koffi from 'koffi';

const mocks = vi.hoisted(() => ({ bitmap: vi.fn() }));
vi.mock('electron', () => ({ nativeImage: { createFromBitmap: mocks.bitmap } }));
import { loadWindowsResourceIcon } from '../src/main/catalog-icons-windows';

const directories: string[] = [];
afterEach(() => {
  vi.resetAllMocks();
  for (const directory of directories.splice(0)) {
    if (!path.resolve(directory).startsWith(path.join(tmpdir(), 'nexlet-native-icon-'))) throw Error('Unexpected fixture path');
    rmSync(directory, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform !== 'win32')('Windows resource icons', () => {
  it('preserves transparent pixels and BGRA colors from a real native icon', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nexlet-native-icon-')); directories.push(directory);
    // A native-size 32-bit ICO: opaque red on the left, transparent on the right.
    const ico = Buffer.alloc(22 + 40 + 4096 + 128);
    ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico[6] = 32; ico[7] = 32;
    ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(4264, 14); ico.writeUInt32LE(22, 18);
    ico.writeUInt32LE(40, 22); ico.writeInt32LE(32, 26); ico.writeInt32LE(64, 30);
    ico.writeUInt16LE(1, 34); ico.writeUInt16LE(32, 36);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 16; x++) { const offset = 62 + (y * 32 + x) * 4; ico[offset + 2] = 255; ico[offset + 3] = 255; }
      ico[4158 + y * 4 + 2] = 255; ico[4158 + y * 4 + 3] = 255;
    }
    const file = path.join(directory, 'transparent.ico'); writeFileSync(file, ico);
    mocks.bitmap.mockImplementation((bytes: Buffer) => ({ toDataURL: () => bytes.toString('base64') }));
    const pixels = Buffer.from(await loadWindowsResourceIcon(file, 0), 'base64');
    expect(pixels.length).toBe(32 * 32 * 4);
    expect([...pixels.subarray((16 * 32 + 2) * 4, (16 * 32 + 2) * 4 + 4)]).toEqual([0, 0, 255, 255]);
    expect(pixels[(16 * 32 + 29) * 4 + 3]).toBe(0);
  });

  it('releases icon and GDI handles on success, missing resources and conversion failure', async () => {
    const user = koffi.load('user32.dll'), kernel = koffi.load('kernel32.dll');
    const resources = user.func('uint32_t __stdcall GetGuiResources(uintptr_t, uint32_t)');
    const processHandle = kernel.func('uintptr_t __stdcall GetCurrentProcess()')();
    const file = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/shell32.dll');
    mocks.bitmap.mockImplementation((bytes: Buffer) => ({ toDataURL: () => bytes.toString('base64') }));
    const first = await loadWindowsResourceIcon(file, 0);
    expect(first).not.toBe('');
    expect(await loadWindowsResourceIcon(file, 2)).not.toBe(first);
    const batch = async () => {
      for (let count = 0; count < 20; count++) {
        expect(await loadWindowsResourceIcon(file, 0)).toBe(first);
        expect(await loadWindowsResourceIcon(file + '.missing', 0)).toBe('');
        mocks.bitmap.mockImplementationOnce(() => { throw Error('Conversion failed'); });
        await expect(loadWindowsResourceIcon(file, 0)).rejects.toThrow('Conversion failed');
      }
    };
    await batch(); // Initialize Windows' per-process/thread shell caches before measuring.
    const before = [resources(processHandle, 0), resources(processHandle, 1)];
    await batch();
    expect(resources(processHandle, 0)).toBe(before[0]);
    expect(resources(processHandle, 1)).toBe(before[1]);
  });
});
