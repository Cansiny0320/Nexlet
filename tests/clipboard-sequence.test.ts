import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createReader, reader, read, readText } = vi.hoisted(() => ({
  createReader: vi.fn(), reader: vi.fn(), read: vi.fn(), readText: vi.fn()
}));
vi.mock('../src/main/mac-pasteboard', () => ({ createMacPasteboardReader: createReader }));
vi.mock('electron', () => ({
  systemPreferences: {}, clipboard: { read, readText }, ClipboardItem: class {},
  nativeImage: { createEmpty: () => ({ isEmpty: () => true }) }
}));
vi.mock('koffi', () => ({ default: {} }));
import { Platform } from '../src/main/platform';
import { ClipboardService } from '../src/main/clipboard';

beforeEach(() => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
  createReader.mockReset().mockReturnValue(reader);
  reader.mockReset().mockReturnValue(0);
  read.mockReset().mockResolvedValue([]);
  readText.mockReset().mockResolvedValue('fixture');
});
afterEach(() => vi.restoreAllMocks());

describe('macOS change counter', () => {
  it('initializes on demand, preserving zero and subsequent sequence values', () => {
    const platform = new Platform(() => undefined);
    expect(createReader).not.toHaveBeenCalled();
    expect(platform.sequence()).toBe(0);
    reader.mockReturnValue(1);
    expect(platform.sequence()).toBe(1);
    expect(createReader).toHaveBeenCalledTimes(1);
  });

  it.each(['initialization', 'read'])('falls back to content polling on %s failure', stage => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    if (stage === 'initialization') createReader.mockImplementation(() => { throw Error('unavailable'); });
    else reader.mockImplementation(() => { throw Error('unavailable'); });
    const platform = new Platform(() => undefined);
    expect(platform.sequence()).toBeNull();
    expect(platform.sequence()).toBeNull();
    expect(createReader).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

function captureFixture(sequence: () => number | null) {
  const addClip = vi.fn();
  const store = { settings: () => ({ clipboardEnabled: true }), addClip, prune: vi.fn(), hasClipHash: () => true };
  const service = new ClipboardService(store as any, { sequence, readFiles: async () => [] } as any, vi.fn());
  return { service, addClip };
}

describe('capture with a change counter', () => {
  it('reads initially, skips unchanged contents, and allows explicit capture', async () => {
    const { service } = captureFixture(() => 0);
    await service.capture();
    await service.capture();
    expect(read).toHaveBeenCalledTimes(1);
    await service.capture(true);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('observes a change that happens while the prior read is pending', async () => {
    let sequence = 3, release!: (value: unknown[]) => void;
    read.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const { service, addClip } = captureFixture(() => sequence);
    readText.mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    const first = service.capture();
    sequence = 4;
    release([]);
    await first;
    await service.capture();
    expect(addClip.mock.calls.map(([item]) => item.text)).toEqual(['first', 'second']);
  });

  it('retries failed reads without advancing the captured sequence', async () => {
    const { service } = captureFixture(() => 10);
    read.mockRejectedValueOnce(Error('busy'));
    await service.capture();
    expect(service.error).toBe('busy');
    await service.capture();
    expect(read).toHaveBeenCalledTimes(2);
    expect(service.error).toBeNull();
  });

  it('keeps polling when native detection is unavailable', async () => {
    const { service } = captureFixture(() => null);
    await service.capture();
    await service.capture();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('skips concealed contents without repeatedly reading the same sequence', async () => {
    read.mockResolvedValue([{ types: ['org.nspasteboard.ConcealedType'] }]);
    const { service, addClip } = captureFixture(() => 15);
    await service.capture();
    await service.capture();
    expect(read).toHaveBeenCalledTimes(1);
    expect(readText).not.toHaveBeenCalled();
    expect(addClip).not.toHaveBeenCalled();
  });
});
