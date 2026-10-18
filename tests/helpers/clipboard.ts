import type { ElectronApplication } from '@playwright/test';

type ClipboardFixture = {
  snapshot: Record<string, unknown>;
  version?: number | null;
  originals: { owner: any; name: string; method: (...args: any[]) => any }[];
};

export async function saveClipboard(app: Pick<ElectronApplication, 'evaluate'>) {
  await app.evaluate(async ({ clipboard }) => {
    const g = globalThis as any,
      n = g.__nexlet;
    const state: ClipboardFixture = {
      snapshot: await n.selectionPlatform.snapshot(),
      originals: [],
    };
    for (const [owner, name] of [
      [clipboard, 'write'],
      [clipboard, 'writeText'],
      [clipboard, 'clear'],
      [n.platform, 'writeFiles'],
    ] as const) {
      const method = (owner as any)[name];
      state.originals.push({ owner, name, method });
      (owner as any)[name] = function (...args: unknown[]) {
        const record = (value: unknown) => {
          state.version = n.platform.sequence();
          return value;
        };
        try {
          const result = method.apply(this, args);
          return result && typeof result.then === 'function'
            ? result.then(record, (error: unknown) => {
                record(undefined);
                throw error;
              })
            : record(result);
        } catch (error) {
          record(undefined);
          throw error;
        }
      };
    }
    g.__nexletClipboardFixture = state;
  });
}

export async function restoreClipboard(app: Pick<ElectronApplication, 'evaluate'>) {
  await app.evaluate(async ({ clipboard }) => {
    const g = globalThis as any,
      n = g.__nexlet,
      state = g.__nexletClipboardFixture as ClipboardFixture | undefined;
    if (!state) return;
    delete g.__nexletClipboardFixture;
    try {
      // Without a native sequence, ownership cannot be distinguished from a user's new copy.
      if (state.version == null || n.platform.sequence() !== state.version) return;
      const data = state.snapshot.data;
      if (state.snapshot.native !== 'mac' && Array.isArray(data)) {
        const populated = data.filter((item) => Object.keys(item).length > 0);
        if (populated.length === 0) clipboard.clear();
        else
          await n.selectionPlatform.restore({ ...state.snapshot, data: populated }, state.version);
      } else await n.selectionPlatform.restore(state.snapshot, state.version);
    } finally {
      for (const { owner, name, method } of state.originals) owner[name] = method;
    }
  });
}
