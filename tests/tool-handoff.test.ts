import { describe, it, expect } from 'vite-plus/test';
import { ToolHandoffs } from '../src/main/tool-handoff';
const snapshot = {
  version: 1,
  view: 'json',
  query: '',
  state: { before: '{"x":1}', after: '{"x":2}', tab: 'diff' },
};
describe('two-phase tool handoff', () => {
  it('limits snapshot ownership and only commits after target acknowledgement', async () => {
    const handoff = new ToolHandoffs();
    let token = '',
      shown = false;
    const pending = handoff.transfer(1, snapshot, (id) => {
      token = id;
      return {
        id: 2,
        show: () => {
          shown = true;
        },
        destroy: () => {},
      };
    });
    expect(shown).toBe(false);
    expect(() => handoff.read(3, token)).toThrow();
    expect(handoff.read(2, token)).toEqual(snapshot);
    handoff.acknowledge(2, token);
    await pending;
    expect(shown).toBe(true);
    expect(() => handoff.read(2, token)).toThrow();
  });
  it('destroys target and leaves source on failure, timeout or close', async () => {
    for (const mode of ['failure', 'timeout', 'close']) {
      const handoff = new ToolHandoffs();
      let token = '',
        destroyed = false;
      const pending = handoff.transfer(
        1,
        snapshot,
        (id) => {
          token = id;
          return {
            id: 2,
            show: () => {
              throw Error('must not commit');
            },
            destroy: () => {
              destroyed = true;
            },
          };
        },
        10,
      );
      if (mode === 'failure') handoff.acknowledge(2, token, '恢复失败');
      if (mode === 'close') handoff.forget(1);
      await expect(pending).rejects.toThrow();
      expect(destroyed).toBe(true);
    }
  });
  it('rejects oversized and unsupported snapshots before creating a target', async () => {
    const handoff = new ToolHandoffs();
    await expect(
      handoff.transfer(1, { ...snapshot, view: 'plugin' }, () => {
        throw Error('created');
      }),
    ).rejects.toThrow('工具状态无效');
    await expect(
      handoff.transfer(1, { ...snapshot, state: { input: 'x'.repeat(4000001) } }, () => {
        throw Error('created');
      }),
    ).rejects.toThrow('4 MB');
  });
});
