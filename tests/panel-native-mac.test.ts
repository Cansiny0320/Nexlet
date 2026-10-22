import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';

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
    struct: (v: string) => v,
    proto: (v: string) => v,
    pointer: (v: unknown) => v,
    decode: (v: unknown) => v,
  },
}));
vi.mock('../src/main/selection-native', () => ({
  createNativeSelection: () => ({ target: mocks.target }),
}));
type Input = { at: number; type?: number; x?: number; control?: unknown };
let now: number, inputs: Input[], callback: (...args: any[]) => unknown;
let fns: Record<string, ReturnType<typeof vi.fn>>, delivered: { at: number; suppressed: boolean }[];
const messages = (type: string) =>
  mocks.port.postMessage.mock.calls.map(([m]) => m).filter((m) => m.type === type);
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  now = 0;
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
      if (name === 'CGEventGetIntegerValueField') fn.mockReturnValue(0);
      if (name === 'CGEventGetLocation')
        fn.mockImplementation((event) => ({ x: event.x ?? 10, y: 20 }));
      if (name === 'CFRunLoopRunInMode')
        fn.mockImplementation((_mode, seconds) => {
          if (now > 1500) throw Error('Loop did not stop');
          const next = inputs
            .filter((event) => event.type !== undefined)
            .sort((a, b) => a.at - b.at)[0];
          const until = now + seconds * 1000;
          if (next && next.at <= until) {
            now = Math.max(now, next.at);
            inputs.splice(inputs.indexOf(next), 1);
            delivered.push({ at: now, suppressed: callback(null, next.type, next) === null });
            return 4;
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
    { at: 1, type: 5 },
    { at: 2, type: 5 },
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
