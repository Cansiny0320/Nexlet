import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';

let application: ElectronApplication, main: Page, directory: string;
let child: ChildProcess;
test.beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'nexlet-save-close-'));
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), NEXLET_TEST_MODE: '1', NEXLET_USER_DATA: directory, NEXLET_TEST_DEFER_CATALOG_SCAN: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({ args: [process.cwd()], env });
  child = application.process();
  main = await application.firstWindow();
  await expect(main.locator('.launcher-input')).toBeVisible();
  await application.evaluate(() => (globalThis as any).__nexlet.main.webContents.send('host-change', 'navigate:scratchpad'));
  await expect(main.locator('.scratch-lines textarea').first()).toBeVisible();
});
test.afterEach(async () => {
  // Failure cases deliberately retain unsaved editors. Terminate only this fixture.
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
    await application.evaluate(({ app }) => { app.exit(0); }).catch(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
    await exited;
  }
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('nexlet-save-close-')) throw Error('Unsafe test cleanup');
  await rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

async function detachedPad() {
  const opened = application.waitForEvent('window');
  await main.getByRole('button', { name: '分离为独立窗口', exact: true }).click();
  const page = await opened;
  await expect(page.locator('.scratch-lines textarea').first()).toBeVisible();
  return page;
}
async function editBeforeDebounce(page: Page, expression: string) {
  // Hold only the editor debounce; the close handshake must explicitly flush it.
  await page.evaluate(() => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => original(callback, delay === 250 ? 60_000 : delay, ...args)) as typeof window.setTimeout;
  });
  await page.locator('.scratch-lines textarea').first().fill(expression);
  await expect(page.locator('.save-indicator')).toHaveText('未保存');
}
async function savedExpression() {
  return application.evaluate(() => (globalThis as any).__nexlet.store.pads()[0].lines[0].expression);
}

for (const trigger of ['titlebar', 'native'] as const) {
  test(`flushes the pending edit before ${trigger} closes a detached pad`, async () => {
    const page = await detachedPad(); await editBeforeDebounce(page, '987654+321');
    const closed = page.waitForEvent('close');
    if (trigger === 'titlebar') await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
    else await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window !== (globalThis as any).__nexlet.main)!.close());
    await closed;
    expect(await savedExpression()).toBe('987654+321');
  });
}

for (const trigger of ['close', 'quit'] as const) {
  test(`keeps the editor usable when saving fails during ${trigger}, then allows retry`, async () => {
    const page = await detachedPad(); await editBeforeDebounce(page, '123+456');
    await application.evaluate(() => {
      const n = (globalThis as any).__nexlet, original = n.store.set.bind(n.store);
      n.restorePadWrites = () => { n.store.set = original; };
      n.store.set = (key: string, value: unknown) => { if (key === 'pads') throw Error('fixture save failure'); original(key, value); };
    });
    if (trigger === 'quit') await application.evaluate(({ app }) => { setImmediate(() => app.quit()); });
    else await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
    await expect(page.locator('.save-indicator')).toHaveText('保存失败');
    await expect(page.locator('.app-shell')).not.toHaveAttribute('inert');
    expect(page.isClosed()).toBe(false);
    expect(await savedExpression()).toBe('');
    await page.locator('.scratch-lines textarea').first().fill('123+789');
    await application.evaluate(() => (globalThis as any).__nexlet.restorePadWrites());
    const closed = page.waitForEvent('close');
    await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
    await closed;
    expect(await savedExpression()).toBe('123+789');
    await expect(main.locator('.launcher-input')).toBeVisible();
  });
}

test('flushes pending edits before quitting the application', async () => {
  await editBeforeDebounce(main, '111+222');
  await application.evaluate(async () => { await (globalThis as any).__nexlet.panel.open(); });
  expect(await application.evaluate(() => !!(globalThis as any).__nexlet.panel.window)).toBe(true);
  const child = application.process();
  await application.evaluate(({ app }) => { setImmediate(() => app.quit()); });
  await expect.poll(() => child.exitCode, { timeout: 15000 }).toBe(0);
  const sql = new DatabaseSync(path.join(directory, 'nexlet.sqlite'), { readOnly: true });
  try {
    const row = sql.prepare("SELECT value FROM documents WHERE key='pads'").get() as { value: string };
    expect(JSON.parse(row.value)[0].lines[0].expression).toBe('111+222');
  } finally { sql.close(); }
});
