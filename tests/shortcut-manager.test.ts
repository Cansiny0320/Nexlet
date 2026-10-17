import { it, expect, vi } from 'vite-plus/test';
import { ShortcutManager, normalizeAccelerator } from '../src/main/shortcut-manager';
function fixture() {
  const callbacks = new Map<string, () => void>(),
    blocked = new Set<string>();
  const backend = {
    register: vi.fn((key: string, callback: () => void) => {
      if (blocked.has(key)) return false;
      callbacks.set(key, callback);
      return true;
    }),
    unregister: vi.fn((key: string) => {
      callbacks.delete(key);
    }),
  };
  const dispatch = vi.fn();
  return {
    callbacks,
    blocked,
    backend,
    dispatch,
    manager: new ShortcutManager(backend, dispatch, 'darwin'),
  };
}
it('normalizes synonyms and refuses duplicates including the wake key', () => {
  expect(normalizeAccelerator('shift+cmd+K', 'darwin')).toBe('Command+Shift+K');
  const { manager } = fixture();
  expect(() =>
    manager.apply(
      [
        { id: 'wake', accelerator: 'cmd+k' },
        { id: 'json', accelerator: 'Command+K' },
      ],
      () => {},
    ),
  ).toThrow('重复');
});
it('keeps prior configuration and active shortcut on OS conflict or persistence failure', () => {
  const { manager, blocked, callbacks } = fixture();
  manager.apply([{ id: 'json', accelerator: 'Ctrl+J' }], () => {});
  blocked.add('Control+K');
  const save = vi.fn();
  expect(() => manager.apply([{ id: 'json', accelerator: 'Ctrl+K' }], save)).toThrow('占用');
  expect(save).not.toHaveBeenCalled();
  expect(callbacks.has('Control+J')).toBe(true);
  expect(() =>
    manager.apply([{ id: 'json', accelerator: 'Ctrl+L' }], () => {
      throw Error('disk');
    }),
  ).toThrow('disk');
  expect([...callbacks.keys()]).toEqual(['Control+J']);
});
it('swaps existing bindings without unregistering and dispatches the new target', () => {
  const { manager, callbacks, backend, dispatch } = fixture();
  manager.apply(
    [
      { id: 'a', accelerator: 'Ctrl+A' },
      { id: 'b', accelerator: 'Ctrl+B' },
    ],
    () => {},
  );
  manager.apply(
    [
      { id: 'b', accelerator: 'Ctrl+A' },
      { id: 'a', accelerator: 'Ctrl+B' },
    ],
    () => {},
  );
  callbacks.get('Control+A')!();
  expect(dispatch).toHaveBeenCalledWith('b');
  expect(backend.unregister).not.toHaveBeenCalled();
});
it('retains desired but inactive status for unavailable features and startup conflicts', () => {
  const { manager, blocked, callbacks } = fixture();
  blocked.add('Control+J');
  manager.apply(
    [
      { id: 'json', accelerator: 'Ctrl+J' },
      { id: 'missing', accelerator: 'Ctrl+K', inactive: '功能不可用' },
    ],
    () => {},
    false,
  );
  expect(manager.status('json')).toMatchObject({
    desired: 'Ctrl+J',
    effective: null,
    error: expect.stringContaining('占用'),
  });
  expect(manager.status('missing').inactive).toBe('功能不可用');
  expect(callbacks.size).toBe(0);
});
it('allows saving unrelated preferences when a pre-existing startup conflict remains', () => {
  const { manager, blocked } = fixture();
  blocked.add('Alt+Space');
  const bindings = [{ id: 'wake', accelerator: 'Alt+Space' }];
  manager.apply(bindings, () => {}, false);
  const save = vi.fn();
  manager.apply(bindings, save);
  expect(save).toHaveBeenCalledOnce();
  expect(manager.status('wake').effective).toBeNull();
});
