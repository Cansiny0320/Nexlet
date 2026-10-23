import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  receive: vi.fn(),
  port: { postMessage: vi.fn(), close: vi.fn(), on: vi.fn() },
  target: vi.fn(),
  config: { mouse: 'right' as 'right' | 'middle', holdMs: 200, excludedApps: [], busy: false },
}));
vi.mock('node:worker_threads', () => ({
  parentPort: mocks.port,
  receiveMessageOnPort: mocks.receive,
  workerData: mocks.config,
}));
vi.mock('koffi', () => ({
  default: {
    load: mocks.load,
    register: mocks.register,
    unregister: mocks.unregister,
    struct: (v: string) => v,
    proto: (v: string) => v,
    pointer: (v: unknown) => v,
    decode: (v: unknown) => v,
  },
}));
vi.mock('../src/main/selection-native', () => ({
  createNativeSelection: () => ({ target: mocks.target }),
}));
type Input = { at: number; type?: number; x?: number; button?: number; control?: unknown };
let now: number, inputs: Input[], callback: (...args: any[]) => unknown;
let eventMask: bigint;
let fns: Record<string, ReturnType<typeof vi.fn>>, delivered: { at: number; suppressed: boolean }[];
const messages = (type: string) =>
  mocks.port.postMessage.mock.calls.map(([m]) => m).filter((m) => m.type === type);
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  now = 0;
  eventMask = 0n;
  mocks.config.mouse = 'right';
  inputs = [];
  fns = {};
  delivered = [];
  vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  mocks.target.mockReturnValue({ pid: 7, app: 'Editor' });
  mocks.register.mockImplementation((fn) => {
    callback = fn;
    return fn;
  });
  mocks.receive.mockImplementation(() => {
    const i = inputs.findIndex((event) => event.control && event.at <= now);
    return i < 0 ? undefined : { message: inputs.splice(i, 1)[0].control };
  });
  mocks.load.mockImplementation(() => ({
    symbol: () => 'default-mode',
    func: (signature: string) => {
      const name = signature.includes('(') ? signature.match(/(\w+)\(/)![1] : signature;
      const fn = vi.fn().mockReturnValue(1);
      if (name === 'CGEventTapCreate')
        fn.mockImplementation((_location, _placement, _options, mask) => {
          eventMask = mask;
          return 1;
        });
      if (name === 'CGEventGetIntegerValueField')
        fn.mockImplementation((event, field) => (field === 3 ? (event.button ?? 0) : 0));
      if (name === 'CGEventGetLocation')
        fn.mockImplementation((event) => ({ x: event.x ?? 10, y: 20 }));
      if (name === 'CFRunLoopRunInMode')
        fn.mockImplementation((_mode, seconds) => {
          if (now > 1500) throw Error('Loop did not stop');
          const until = now + seconds * 1000;
          while (true) {
            const next = inputs
              .filter((event) => event.type !== undefined)
              .sort((a, b) => a.at - b.at)[0];
            if (!next || next.at > until) break;
            now = Math.max(now, next.at);
            inputs.splice(inputs.indexOf(next), 1);
            const tapped = !!(eventMask & (1n << BigInt(next.type!)));
            delivered.push({
              at: now,
              suppressed: tapped && callback(null, next.type, next) === null,
            });
            if (tapped) return 4;
          }
          now = until;
          return 3;
        });
      fns[name] = fn;
      return fn;
    },
  }));
});
afterEach(() => vi.restoreAllMocks());

it('空闲用 50 ms 原生等待，事件到达立即处理且控制延迟有界', async () => {
  inputs = [
    { at: 1, type: 1 },
    { at: 2, type: 1 },
    { at: 101, control: { type: 'stop' } },
  ];
  await import('../src/main/panel-native-worker');
  expect(delivered).toEqual([
    { at: 1, suppressed: false },
    { at: 2, suppressed: false },
  ]);
  expect(fns.CFRunLoopRunInMode).toHaveBeenCalledWith('default-mode', 0.05, true);
  expect(now).toBeLessThanOrEqual(151);
  expect(messages('error')).toEqual([]);
  expect(mocks.port.on).not.toHaveBeenCalled();
  expect(mocks.unregister).toHaveBeenCalledOnce();
  expect(messages('pointerDown')).toHaveLength(2);
});

it.each(['right', 'middle'] as const)(
  '%s 触发不把普通移动或左键拖动送入同步回调，仍监听外部点击',
  async (mouse) => {
    mocks.config.mouse = mouse;
    inputs = [
      { at: 1, type: 1 },
      ...Array.from({ length: 1000 }, (_, i) => ({ at: i + 2, type: i % 2 ? 6 : 5 })),
      { at: 1002, type: 2 },
      { at: 1003, control: { type: 'stop' } },
    ];
    await import('../src/main/panel-native-worker');
    for (const type of [2, 5, 6, ...(mouse === 'right' ? [26, 27] : [4, 7])])
      expect(eventMask & (1n << BigInt(type))).toBe(0n);
    expect(delivered).toHaveLength(1002);
    expect(delivered.every((event) => !event.suppressed)).toBe(true);
    expect(fns.CGEventGetLocation).toHaveBeenCalledOnce();
    expect(mocks.target).not.toHaveBeenCalled();
    expect(messages('pointerDown')).toHaveLength(1);
    expect(messages('error')).toEqual([]);
  },
);

it('中键按下即触发，按住拖动与松开仍送达面板', async () => {
  mocks.config.mouse = 'middle';
  inputs = [
    { at: 1, type: 25, button: 2 },
    { at: 2, type: 27, button: 2, x: 40 },
    { at: 50, type: 26, button: 2, x: 40 },
    { at: 60, control: { type: 'stop' } },
  ];
  await import('../src/main/panel-native-worker');
  expect(delivered.every((event) => event.suppressed)).toBe(true);
  expect(messages('trigger')).toEqual([{ type: 'trigger', point: { x: 10, y: 20 } }]);
  expect(messages('move')).toEqual([{ type: 'move', point: { x: 40, y: 20 } }]);
  expect(messages('release')).toEqual([{ type: 'release', x: 40, y: 20, quick: true }]);
  expect(fns.CGEventPost).not.toHaveBeenCalled();
  expect(messages('error')).toEqual([]);
});

it('长按维持 8 ms 检查，短按和拖动正常回放，停止释放事件源', async () => {
  inputs = [
    { at: 1, type: 3 },
    { at: 250, type: 4 },
    { at: 300, type: 3 },
    { at: 340, type: 4 },
    { at: 400, type: 3 },
    { at: 405, type: 7, x: 100 },
    { at: 410, type: 4 },
    { at: 420, control: { type: 'stop' } },
  ];
  const triggers: number[] = [];
  mocks.port.postMessage.mockImplementation((message) => {
    if (message.type === 'trigger') triggers.push(now);
  });
  await import('../src/main/panel-native-worker');
  expect(triggers).toEqual([201]);
  expect(fns.CFRunLoopRunInMode).toHaveBeenCalledWith('default-mode', 0.008, true);
  expect(fns.CGEventPost).toHaveBeenCalledTimes(3);
  expect(messages('release')).toHaveLength(1);
  expect(fns.CFMachPortInvalidate).toHaveBeenCalledOnce();
  expect(messages('error')).toEqual([]);
});
