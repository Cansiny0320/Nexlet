import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  exec: vi.fn(),
  spawn: vi.fn(),
  access: vi.fn(),
  copyFile: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/nexlet-engine', getAppPath: () => '/app' },
}));
vi.mock('node:child_process', () => {
  Object.assign(mocks.exec, {
    [Symbol.for('nodejs.util.promisify.custom')]: (...args: unknown[]) =>
      new Promise((resolve, reject) =>
        mocks.exec(...args, (error: Error | null, stdout: string, stderr: string) =>
          error ? reject(error) : resolve({ stdout, stderr }),
        ),
      ),
  });
  return { execFile: mocks.exec, spawn: mocks.spawn };
});
vi.mock('node:fs/promises', () => ({
  access: mocks.access,
  copyFile: mocks.copyFile,
  mkdir: mocks.mkdir,
  writeFile: mocks.writeFile,
}));
import { EverythingEngine } from '../src/main/everything-engine';

let child: EventEmitter & {
  pid: number;
  exitCode: number | null;
  signalCode: string | null;
  kill: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  vi.resetAllMocks();
  child = Object.assign(new EventEmitter(), {
    pid: 123,
    exitCode: null as number | null,
    signalCode: null as string | null,
    kill: vi.fn(),
  });
  mocks.spawn.mockReturnValue(child);
  mocks.access.mockResolvedValue(undefined);
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.copyFile.mockResolvedValue(undefined);
  mocks.writeFile.mockResolvedValue(undefined);
  mocks.exec.mockImplementation((_f, _a, _o, callback) => callback(null, '1.4.1.1032', ''));
});
function missingInstance() {
  mocks.exec.mockImplementationOnce((_f, _a, _o, callback) =>
    callback(Object.assign(new Error('timeout'), { killed: true }), '', ''),
  );
}

describe('Everything engine lifecycle', () => {
  it('does not overwrite an existing versioned executable', async () => {
    missingInstance();
    const engine = new EverythingEngine(() => ['C:\\fixture']);
    await engine.ensure();
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(mocks.copyFile).not.toHaveBeenCalled();
  });
  it('reuses its live child when IPC temporarily stops responding', async () => {
    missingInstance();
    const engine = new EverythingEngine(() => ['C:\\fixture']);
    await engine.ensure();
    mocks.copyFile.mockClear();
    mocks.copyFile.mockRejectedValue(Object.assign(new Error('locked'), { code: 'EBUSY' }));
    missingInstance();
    await expect(engine.ensure()).resolves.toBe('1.4.1.1032');
    expect(mocks.copyFile).not.toHaveBeenCalled();
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });
  it('copies a missing executable once and shares concurrent starts', async () => {
    missingInstance();
    mocks.access.mockImplementation(async (file: string) => {
      if (!file.includes('vendor')) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    });
    const engine = new EverythingEngine(() => ['C:\\fixture']);
    await Promise.all([engine.ensure(), engine.ensure()]);
    expect(mocks.copyFile).toHaveBeenCalledTimes(1);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });
  it('restarts an exited child without replacing the executable', async () => {
    missingInstance();
    const engine = new EverythingEngine(() => ['C:\\fixture']);
    await engine.ensure();
    child.exitCode = 1;
    child.emit('exit', 1);
    mocks.spawn.mockImplementationOnce(() =>
      Object.assign(new EventEmitter(), { pid: 124, exitCode: null, signalCode: null }),
    );
    missingInstance();
    await engine.ensure();
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    expect(mocks.copyFile).not.toHaveBeenCalled();
  });
  it('keeps a live process preparing when startup IPC remains slow', async () => {
    vi.useFakeTimers();
    try {
      mocks.exec.mockImplementation((_f, _a, _o, callback) =>
        callback(Object.assign(new Error('timeout'), { killed: true }), '', ''),
      );
      const engine = new EverythingEngine(() => ['C:\\fixture']),
        start = engine.ensure();
      await vi.runAllTimersAsync();
      await expect(start).resolves.toBe('1.4.1.1032');
      expect(engine.running).toBe(true);
      expect(mocks.spawn).toHaveBeenCalledTimes(1);
      expect(mocks.copyFile).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
