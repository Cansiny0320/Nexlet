import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('typed host RPC survives reload and preserves errors and window ownership', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'nexlet-host-rpc-'));
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    NEXLET_TEST_MODE: '1',
    NEXLET_TEST_DEFER_CATALOG_SCAN: '1',
    NEXLET_USER_DATA: folder,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => !!window.nexlet);
    const result = await page.evaluate(async () => {
      const state = await window.nexlet.call('state');
      const search = await window.nexlet.call('search', { query: 'JSON', from: 'input' });
      let message = '';
      try {
        await window.nexlet.call('clipDetail', 42 as unknown as string);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      let forbidden = '';
      try {
        await window.nexlet.call('panel', { action: 'clear' });
      } catch (error) {
        forbidden = error instanceof Error ? error.message : String(error);
      }
      return { version: state.version, inputType: search.input.type, message, forbidden };
    });
    expect(result.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(result.inputType).toBe('text');
    expect(result.message).toBeTruthy();
    expect(result.message).not.toContain('Internal server error');
    expect(result.forbidden).toContain('超级面板');
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await page.waitForFunction(() => !!window.nexlet);
      expect(await page.evaluate(async () => (await window.nexlet.call('state')).version)).toBe(
        result.version,
      );
    }
    const listeners = await app.evaluate(() =>
      (globalThis as any).__nexlet.main.webContents.listenerCount('did-start-navigation'),
    );
    expect(listeners).toBe(1);
  } finally {
    await app.close();
  }
});
