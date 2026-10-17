import { describe, it, expect, vi } from 'vite-plus/test';
import { SelectionService, type SelectionBackend } from '../src/main/selection';
function setup() {
  let seq = 1,
    content = 'old',
    front = true,
    paused = false,
    clock = 0;
  const writes: string[] = [];
  const b: SelectionBackend = {
    target: async () => ({ pid: 99, app: 'editor' }),
    same: async () => front,
    direct: async () => undefined,
    sequence: () => seq,
    snapshot: async () => ({ content }),
    restore: async (s) => {
      content = s.content as string;
      seq++;
      writes.push(content);
    },
    copy: async () => {
      content = 'selected';
      seq++;
    },
    read: async () => ({ type: 'text', text: content }),
    exclusive: async (fn) => {
      paused = true;
      try {
        return await fn();
      } finally {
        paused = false;
      }
    },
    waitKeys: async () => true,
    delay: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  };
  return {
    b,
    service: new SelectionService(b),
    writes,
    get paused() {
      return paused;
    },
    change(v: string) {
      content = v;
      seq++;
    },
    front(v: boolean) {
      front = v;
    },
  };
}
describe('selection capture transaction', () => {
  it('captures new selection and restores original clipboard under history pause', async () => {
    const x = setup();
    const original = x.b.restore;
    x.b.restore = async (s) => {
      expect(x.paused).toBe(true);
      await original(s, 2);
    };
    const r = await x.service.capture();
    expect(r.content).toEqual({ type: 'text', text: 'selected' });
    expect(x.writes).toEqual(['old']);
    expect(x.paused).toBe(false);
  });
  it('never reuses stale clipboard after a copy that does not change it', async () => {
    const x = setup();
    x.b.copy = async () => {};
    expect((await x.service.capture()).content).toBeUndefined();
    expect(x.writes).toEqual([]);
  });
  it('does not overwrite a later external copy', async () => {
    const x = setup();
    x.b.read = async () => {
      x.change('new user copy');
      return { type: 'text', text: 'selected' };
    };
    expect((await x.service.capture()).content).toBeUndefined();
    expect(x.writes).toEqual([]);
  });
  it('uses direct selection without touching clipboard', async () => {
    const x = setup();
    x.b.direct = async () => ({ type: 'text', text: 'direct' });
    x.b.copy = vi.fn();
    expect((await x.service.capture()).content).toEqual({ type: 'text', text: 'direct' });
    expect(x.b.copy).not.toHaveBeenCalled();
  });
  it('fails before copy if original clipboard cannot be fully snapshotted', async () => {
    const x = setup();
    x.b.snapshot = async () => {
      throw Error('unsupported format');
    };
    x.b.copy = vi.fn();
    const r = await x.service.capture();
    expect(r.issue).toContain('unsupported');
    expect(x.b.copy).not.toHaveBeenCalled();
    expect(x.paused).toBe(false);
  });
  it('cancels on focus change or a newer request and still restores our temporary copy', async () => {
    const x = setup();
    x.b.read = async () => {
      x.service.cancel();
      return { type: 'text', text: 'selected' };
    };
    expect((await x.service.capture()).content).toBeUndefined();
    expect(x.writes).toEqual(['old']);
    const y = setup();
    y.b.waitKeys = async () => {
      y.front(false);
      return true;
    };
    y.b.copy = vi.fn();
    expect((await y.service.capture()).content).toBeUndefined();
    expect(y.b.copy).not.toHaveBeenCalled();
  });
});
it('waits for an already sent copy after cancellation, then restores before another capture', async () => {
  const x = setup();
  x.b.copy = async () => {
    x.service.cancel();
  };
  let waited = false;
  x.b.delay = async () => {
    if (!waited) {
      waited = true;
      x.change('late copy');
    }
  };
  expect((await x.service.capture()).content).toBeUndefined();
  expect(x.writes).toEqual(['old']);
});
it('empty native selection and excluded apps do not fall back to clipboard', async () => {
  const x = setup();
  x.b.direct = async () => null;
  x.b.copy = vi.fn();
  expect((await x.service.capture()).content).toBeUndefined();
  expect(x.b.copy).not.toHaveBeenCalled();
  const y = setup();
  y.b.direct = vi.fn();
  expect((await y.service.capture(['EDITOR'])).issue).toContain('排除');
  expect(y.b.direct).not.toHaveBeenCalled();
});

it('waits for a multi-item copy to populate after the clipboard version changes', async () => {
  const x = setup();
  let populated = false;
  x.b.delay = async () => {
    populated = true;
  };
  x.b.read = async () => ({
    type: 'files',
    paths: populated ? ['/file.txt', '/directory'] : ['/file.txt'],
  });
  expect((await x.service.capture()).content).toEqual({
    type: 'files',
    paths: ['/file.txt', '/directory'],
  });
  expect(x.writes).toEqual(['old']);
});
it('preserves an external copy that arrives while the initial copy settles', async () => {
  const x = setup();
  x.b.delay = async () => {
    x.change('external copy');
  };
  x.b.read = vi.fn();
  expect((await x.service.capture()).content).toBeUndefined();
  expect(x.b.read).not.toHaveBeenCalled();
  expect(x.writes).toEqual([]);
});
