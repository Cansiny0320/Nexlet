import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir } from 'node:fs/promises';
import path from 'node:path';

const exec = promisify(execFile);
const calculatorId = 'uwp:Microsoft.WindowsCalculator_8wekyb3d8bbwe!App';
const missingId = 'uwp:Nexlet.Nonexistent_0000000000000!App';
let app: ElectronApplication, page: Page;
let originalCalculatorPids: number[] = [];
async function calculatorPids(): Promise<number[]> {
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '@(Get-Process CalculatorApp,Calculator -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id) | ConvertTo-Json -Compress'], { windowsHide: true });
  const value = JSON.parse(stdout || '[]');
  return Array.isArray(value) ? value : [value];
}
async function call(action: string, payload?: unknown): Promise<any> {
  return page.evaluate(({ action, payload }) => (window as any).nexlet.call(action, payload), { action, payload });
}

test.describe('Windows packaged application launch', () => {
  test.skip(process.platform !== 'win32', 'Requires the Windows Shell and installed Calculator');
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => {
    originalCalculatorPids = await calculatorPids();
    await mkdir(path.join(process.cwd(), '.tmp'), { recursive: true });
    const data = await mkdtemp(path.join(process.cwd(), '.tmp', 'windows-launch-'));
    const env: Record<string, string> = {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      NEXLET_TEST_MODE: '1', NEXLET_USER_DATA: data
    };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ args: [process.cwd()], env });
    page = await app.firstWindow();
    await expect.poll(async () => (await call('state')).catalogLoading, { timeout: 30000 }).toBe(false);
  });
  test.afterAll(async () => {
    if (app) await app.close();
    // Close only Calculator processes opened by this test, leaving existing windows alone.
    for (const pid of (await calculatorPids()).filter(pid => !originalCalculatorPids.includes(pid))) {
      await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -in @('CalculatorApp','Calculator')) { $null=$p.CloseMainWindow() }`], { windowsHide: true });
    }
  });

  test('starts Calculator, accepts activation of an existing instance, and records success', async () => {
    test.skip(!(await call('state')).commands.some((c: any) => c.id === calculatorId), 'Calculator is not installed');
    test.info().annotations.push({ type: 'initial-calculator-processes', description: String(originalCalculatorPids.length) });
    expect(await call('launch', { id: calculatorId })).toEqual({ opened: true });
    await expect.poll(calculatorPids).not.toEqual([]);
    expect((await call('state')).recent[0]).toBe(calculatorId);
    expect(await app.evaluate(() => (globalThis as any).__nexlet.main.isVisible())).toBe(false);
    await app.evaluate(() => (globalThis as any).__nexlet.main.show());
    expect(await call('launch', { id: calculatorId })).toEqual({ opened: true });
  });

  test('shows a real Windows launch failure without hiding the launcher or recording success', async () => {
    const recent = (await call('state')).recent;
    await app.evaluate((_, id) => {
      const n = (globalThis as any).__nexlet;
      n.catalog.items.push({ id, name: 'Nexlet missing application fixture', kind: 'app', keywords: [] });
      n.main.show();
      n.main.webContents.send('host-change', 'changed');
    }, missingId);
    await page.getByRole('textbox').first().fill('Nexlet missing application fixture');
    await page.getByRole('button', { name: 'Nexlet missing application fixture', exact: true }).click();
    await expect(page.locator('.toast.error')).toContainText('Windows 错误 2');
    expect(await app.evaluate(() => (globalThis as any).__nexlet.main.isVisible())).toBe(true);
    expect((await call('state')).recent).toEqual(recent);
  });
});
