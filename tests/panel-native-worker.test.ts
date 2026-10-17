import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

// Never loads a DLL, installs a hook, or sends OS input. The simulated native
// queue lets us check dispatch latency and gesture/control ordering safely.
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  receive: vi.fn(),
  port: { postMessage: vi.fn(), close: vi.fn(), on: vi.fn() },
  target: vi.fn(),
}));
vi.mock('node:worker_threads', () => ({
  parentPort: mocks.port,
  receiveMessageOnPort: mocks.receive,
  workerData: { mouse: 'right', holdMs: 200, excludedApps: [], busy: false },
}));
vi.mock('koffi', () => ({
  default: {
    load: mocks.load,
    register: mocks.register,
    unregister: mocks.unregister,
    struct: (name: string) => name,
    proto: (name: string) => name,
    pointer: (type: unknown) => type,
    out: (type: unknown) => type,
    sizeof: () => 48,
    decode: (data: unknown) => data,
  },
}));
vi.mock('../src/main/selection-native', () => ({
  createNativeSelection: () => ({ target: mocks.target }),
}));

type Event = { at: number; kind?: number; x?: number; y?: number; control?: unknown };
let now: number, events: Event[], callback: (code: number, kind: number, data: unknown) => number;
let functions: Record<string, ReturnType<typeof vi.fn>>;
let delivered: { kind: number; at: number; result: number }[],
  forwarded: { kind: number; at: number }[];
const config = { mouse: 'right', holdMs: 200, excludedApps: [] as string[], busy: false };
const messages = (type: string) =>
  mocks.port.postMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => message.type === type);
const run = () => import('../src/main/panel-native-worker');

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.port.postMessage.mockReset();
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  vi.spyOn(process, 'arch', 'get').mockReturnValue('x64');
  now = 0;
  events = [];
  functions = {};
  delivered = [];
  forwarded = [];
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  mocks.target.mockReturnValue({ pid: 99, handle: '123', app: 'editor.exe', name: 'Editor' });
  mocks.register.mockImplementation((fn) => {
    callback = fn;
    return fn;
  });
  mocks.receive.mockImplementation(() => {
    const index = events.findIndex((event) => event.control && event.at <= now);
    if (index < 0) return undefined;
    return { message: events.splice(index, 1)[0].control };
  });
  mocks.load.mockImplementation(() => ({
    func: (signature: string) => {
      const name = signature.includes('(') ? signature.match(/(\w+)\(/)![1] : signature;
      const fn = vi.fn().mockReturnValue(1);
      if (name === 'CallNextHookEx')
        fn.mockImplementation((_hook, _code, kind) => {
          forwarded.push({ kind, at: now });
          return 0;
        });
      if (name === 'PeekMessageW')
        fn.mockImplementation(() => {
          const index = events.findIndex((event) => event.kind !== undefined && event.at <= now);
          if (index >= 0) {
            const event = events.splice(index, 1)[0];
            const result = callback(0, event.kind!, {
              pt: { x: event.x ?? 10, y: event.y ?? 20 },
              dwExtraInfo: 0,
            });
            delivered.push({ kind: event.kind!, at: now, result });
          }
          // Sent hook callbacks can run even when PeekMessage finds no posted MSG.
          return false;
        });
      if (name === 'MsgWaitForMultipleObjectsEx')
        fn.mockImplementation((_count, _handles, timeout) => {
          if (now > 2000) throw Error('Simulated loop did not stop');
          now = Math.min(
            now + timeout,
            ...events
              .filter((event) => event.kind !== undefined)
              .map((event) => Math.max(now, event.at)),
          );
          return 0;
        });
      functions[name] = fn;
      return fn;
    },
  }));
});
afterEach(() => vi.restoreAllMocks());

describe('Windows panel native message loop (simulated OS)', () => {
  it('forwards mouse input as it arrives between gesture ticks', async () => {
    events = [1, 2, 3].map((at) => ({ at, kind: 0x200 }));
    events.push({ at: 9, control: { type: 'stop' } });
    await run();
    expect(forwarded).toEqual([1, 2, 3].map((at) => ({ kind: 0x200, at })));
    expect(messages('error')).toEqual([]);
    expect(functions.MsgWaitForMultipleObjectsEx).toHaveBeenCalledWith(0, null, 8, 0x04ff, 0x0004);
    expect(mocks.port.close).toHaveBeenCalledOnce();
  });

  it('keeps a 200 ms right hold and replays a normal right click once', async () => {
    events = [
      { at: 1, kind: 0x204 },
      { at: 250, kind: 0x205 },
      { at: 300, kind: 0x204 },
      { at: 340, kind: 0x205 },
      { at: 350, control: { type: 'stop' } },
    ];
    const triggered: number[] = [];
    mocks.port.postMessage.mockImplementation((message) => {
      if (message.type === 'trigger') triggered.push(now);
    });
    await run();
    expect(triggered).toEqual([201]);
    expect(messages('release')).toHaveLength(1);
    expect(delivered.map((event) => event.result)).toEqual([1, 1, 1, 1]);
    expect(functions.SendInput).toHaveBeenCalledOnce();
    const [count, buffer, size] = functions.SendInput.mock.calls[0] as [number, Buffer, number];
    expect(count).toBe(2);
    expect(size).toBe(40);
    expect([buffer.readUInt32LE(20), buffer.readUInt32LE(60)]).toEqual([8, 16]);
  });

  it('receives busy, exclusion and panel-bound changes without a JS event loop', async () => {
    events = [
      { at: 1, control: { type: 'config', config: { ...config, busy: true } } },
      { at: 2, kind: 0x204 },
      { at: 3, kind: 0x205 },
      { at: 4, control: { type: 'config', config: { ...config, excludedApps: ['editor.exe'] } } },
      { at: 5, kind: 0x204 },
      { at: 6, kind: 0x205 },
      { at: 7, control: { type: 'config', config } },
      { at: 8, control: { type: 'panel', bounds: { x: 0, y: 0, width: 100, height: 100 } } },
      { at: 9, kind: 0x204 },
      { at: 10, kind: 0x205 },
      { at: 11, control: { type: 'stop' } },
    ];
    await run();
    expect(delivered.map((event) => event.result)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(functions.SendInput).not.toHaveBeenCalled();
    expect(messages('trigger')).toEqual([]);
    expect(mocks.port.on).not.toHaveBeenCalled();
  });

  it('releases a withheld button and unhooks once when stopped during a hold', async () => {
    events = [
      { at: 1, kind: 0x204 },
      { at: 20, control: { type: 'stop' } },
    ];
    await run();
    expect(functions.SendInput).toHaveBeenCalledOnce();
    expect(functions.SendInput.mock.calls[0][0]).toBe(1);
    expect(functions.UnhookWindowsHookEx).toHaveBeenCalledOnce();
    expect(mocks.unregister).toHaveBeenCalledOnce();
    expect(messages('trigger')).toEqual([]);
  });

  it('reports native wait failures and releases its hook', async () => {
    mocks.port.postMessage.mockImplementation((message) => {
      if (message.type === 'ready')
        functions.MsgWaitForMultipleObjectsEx.mockReturnValue(0xffffffff);
    });
    await run();
    expect(messages('error')[0].error).toContain('鼠标消息等待失败');
    expect(functions.UnhookWindowsHookEx).toHaveBeenCalledOnce();
    expect(mocks.unregister).toHaveBeenCalledOnce();
    expect(mocks.port.close).toHaveBeenCalledOnce();
  });
});
