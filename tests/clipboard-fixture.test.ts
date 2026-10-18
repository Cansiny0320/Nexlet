import { afterEach, expect, it, vi } from 'vite-plus/test';
import type { ElectronApplication } from '@playwright/test';
import { restoreClipboard, saveClipboard } from './helpers/clipboard';

type Data = Record<string, string | Uint8Array | string[]>[];
const applications: Pick<ElectronApplication, 'evaluate'>[] = [];

function fixture(initial: Data = []) {
  let data = structuredClone(initial),
    sequence: number | null = 1;
  class ClipboardItem {
    constructor(public values: Data[number]) {
      if (Object.keys(values).length === 0) throw Error('at least one MIME type is required');
    }
  }
  const changed = (value: Data) => {
    data = structuredClone(value);
    if (sequence !== null) sequence++;
  };
  const clipboard = {
    write: vi.fn(async (items: ClipboardItem[]) => changed(items.map((item) => item.values))),
    writeText: vi.fn(async (text: string) => changed([{ 'text/plain': text }])),
    clear: vi.fn(() => changed([])),
  };
  const platform = {
    sequence: () => sequence,
    // Windows CF_HDROP writes bypass the Electron clipboard methods.
    writeFiles: vi.fn(async (files: string[]) => changed([{ 'windows/files': files }])),
  };
  const selectionPlatform = {
    snapshot: vi.fn(async () => ({ data: structuredClone(data) })),
    restore: vi.fn(async (snapshot: { data: Data }, expected: number) => {
      if (sequence === expected)
        await clipboard.write(snapshot.data.map((values) => new ClipboardItem(values)));
    }),
  };
  vi.stubGlobal('__nexlet', { platform, selectionPlatform });
  const app = {
    evaluate: async (callback: (electron: unknown) => unknown) =>
      callback({ clipboard, ClipboardItem }),
  } as Pick<ElectronApplication, 'evaluate'>;
  applications.push(app);
  return {
    app,
    clipboard,
    platform,
    selectionPlatform,
    data: () => data,
    externalCopy: changed,
    unavailableSequence: () => {
      sequence = null;
    },
  };
}

afterEach(async () => {
  for (const app of applications.splice(0)) await restoreClipboard(app);
  vi.unstubAllGlobals();
});

it('restores an originally empty clipboard after a test writes text', async () => {
  const f = fixture();
  await saveClipboard(f.app);
  await f.clipboard.writeText('test content');
  await restoreClipboard(f.app);
  expect(f.data()).toEqual([]);
  expect(f.clipboard.clear).toHaveBeenCalledOnce();
});

it.each([1, 2])('clears an empty clipboard represented by %i formatless items', async (count) => {
  const f = fixture(Array.from({ length: count }, () => ({})));
  await saveClipboard(f.app);
  await f.clipboard.writeText('test content');
  await restoreClipboard(f.app);
  expect(f.data()).toEqual([]);
  expect(f.clipboard.clear).toHaveBeenCalledOnce();
  expect(f.selectionPlatform.restore).not.toHaveBeenCalled();
});

it('restores populated items and custom formats while skipping formatless items', async () => {
  const populated = { 'text/plain': '原内容', 'application/x-custom': new Uint8Array([0, 255]) };
  const f = fixture([{}, populated, {}]);
  await saveClipboard(f.app);
  await f.clipboard.writeText('test content');
  await restoreClipboard(f.app);
  expect(f.data()).toEqual([populated]);
  expect(f.selectionPlatform.restore).toHaveBeenCalledWith({ data: [populated] }, 2);
  expect(f.clipboard.clear).not.toHaveBeenCalled();
});

it('preserves all items and custom binary formats through the existing selection snapshot', async () => {
  const initial: Data = [
    { 'text/plain': '原内容', 'application/x-nexlet-custom': new Uint8Array([0, 255]) },
    { 'application/x-another-item': 'second' },
  ];
  const f = fixture(initial);
  await saveClipboard(f.app);
  await f.clipboard.writeText('test content');
  await restoreClipboard(f.app);
  expect(f.data()).toEqual(initial);
  expect(f.selectionPlatform.snapshot).toHaveBeenCalledOnce();
  expect(f.selectionPlatform.restore).toHaveBeenCalledOnce();
});

it.each(['write', 'writeText', 'clear', 'writeFiles'] as const)(
  'tracks %s writes and restores only the clipboard still owned by the test',
  async (method) => {
    const initial = [{ 'text/plain': 'original' }];
    const f = fixture(initial);
    await saveClipboard(f.app);
    if (method === 'write') await f.clipboard.write([]);
    else if (method === 'writeText') await f.clipboard.writeText('fixture');
    else if (method === 'clear') expect(f.clipboard.clear()).toBeUndefined();
    else await f.platform.writeFiles(['C:/fixture.txt']);
    await restoreClipboard(f.app);
    expect(f.data()).toEqual(initial);
    expect(f.selectionPlatform.restore).toHaveBeenCalledOnce();
  },
);

it('leaves an external copy made after a test write untouched', async () => {
  const f = fixture([{ 'text/plain': 'original' }]);
  await saveClipboard(f.app);
  await f.clipboard.writeText('fixture');
  f.externalCopy([{ 'text/plain': 'new user copy' }]);
  await restoreClipboard(f.app);
  expect(f.data()).toEqual([{ 'text/plain': 'new user copy' }]);
  expect(f.selectionPlatform.restore).not.toHaveBeenCalled();
});

it('delegates an empty native macOS snapshot to the native pasteboard restorer', async () => {
  const f = fixture();
  const snapshot = { native: 'mac', data: [] };
  f.selectionPlatform.snapshot.mockResolvedValueOnce(snapshot);
  await saveClipboard(f.app);
  await f.clipboard.writeText('fixture');
  await restoreClipboard(f.app);
  expect(f.selectionPlatform.restore).toHaveBeenCalledWith(snapshot, 2);
  expect(f.clipboard.clear).not.toHaveBeenCalled();
  expect(f.data()).toEqual([]);
});

it('does not restore when the test made no write or clipboard ownership is unavailable', async () => {
  const f = fixture([{ 'text/plain': 'original' }]);
  await saveClipboard(f.app);
  await restoreClipboard(f.app);
  expect(f.selectionPlatform.restore).not.toHaveBeenCalled();
  f.unavailableSequence();
  await saveClipboard(f.app);
  await f.clipboard.writeText('fixture');
  f.externalCopy([{ 'text/plain': 'new user copy' }]);
  await restoreClipboard(f.app);
  expect(f.data()).toEqual([{ 'text/plain': 'new user copy' }]);
});

it.each(['sync', 'async'] as const)(
  'restores after a %s writer changes the clipboard and then fails',
  async (mode) => {
    const initial = [{ 'text/plain': 'original' }];
    const f = fixture(initial);
    const failure = Error('clipboard commit failed');
    if (mode === 'sync')
      f.clipboard.clear.mockImplementationOnce(() => {
        f.externalCopy([]);
        throw failure;
      });
    else
      f.platform.writeFiles.mockImplementationOnce(async () => {
        f.externalCopy([]);
        throw failure;
      });
    await saveClipboard(f.app);
    if (mode === 'sync') expect(() => f.clipboard.clear()).toThrow(failure);
    else await expect(f.platform.writeFiles(['C:/fixture.txt'])).rejects.toBe(failure);
    await restoreClipboard(f.app);
    expect(f.data()).toEqual(initial);
  },
);

it('removes every write wrapper even when restoration fails, and cleanup is idempotent', async () => {
  const f = fixture([{ 'text/plain': 'original' }]);
  const originals = [
    f.clipboard.write,
    f.clipboard.writeText,
    f.clipboard.clear,
    f.platform.writeFiles,
  ];
  await saveClipboard(f.app);
  await f.clipboard.writeText('fixture');
  f.selectionPlatform.restore.mockRejectedValueOnce(Error('restore failed'));
  await expect(restoreClipboard(f.app)).rejects.toThrow('restore failed');
  expect([
    f.clipboard.write,
    f.clipboard.writeText,
    f.clipboard.clear,
    f.platform.writeFiles,
  ]).toEqual(originals);
  await expect(restoreClipboard(f.app)).resolves.toBeUndefined();
});
