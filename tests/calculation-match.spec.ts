import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let app: ElectronApplication;
let directory: string;
test.beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'nexlet-calculation-match-'));
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    NEXLET_TEST_MODE: '1',
    NEXLET_USER_DATA: path.join(directory, 'data'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [process.cwd()], env });
  const plugin = path.join(directory, 'plugin');
  await mkdir(plugin);
  await writeFile(
    path.join(plugin, 'plugin.json'),
    JSON.stringify({
      id: 'org.nexlet.text-match-fixture',
      name: '翻译',
      version: '1.0.0',
      apiVersion: 1,
      main: 'index.html',
      permissions: [],
      features: [
        {
          code: 'translate',
          name: '翻译',
          keywords: ['translate'],
          matches: [{ type: 'text', minLength: 1 }],
        },
      ],
    }),
  );
  await writeFile(
    path.join(plugin, 'index.html'),
    '<!doctype html><html><body>Translation fixture</body></html>',
  );
  const page = await app.firstWindow();
  await expect(page.locator('.launcher-input')).toBeVisible();
  await app.evaluate(({ dialog }, plugin) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [plugin] });
  }, plugin);
  await page.evaluate(() => window.nexlet.call('pluginInstall', { development: true }));
});
test.afterEach(async () => {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
});

for (const layout of ['grid', 'list'] as const) {
  test(`${layout}: 输入公式后默认选择计算稿纸，回车带入原公式并可直接续写`, async () => {
    const page = await app.firstWindow();
    await page.evaluate(
      (layout) => window.nexlet.call('commandConfig', { action: 'layout', value: layout }),
      layout,
    );
    const input = page.locator('.launcher-input');
    // The generic plugin is already selected before the expression becomes valid.
    await input.fill('1+');
    await expect(page.locator('[data-command-id].selected')).toHaveAttribute('aria-label', '翻译');
    await input.fill('1+1');
    const calculation = page.locator('[data-command-id="match:calc"]');
    await expect(calculation).toHaveAttribute('aria-label', '计算稿纸');
    await expect(calculation).toHaveClass(/selected/);
    await expect(calculation.locator('img')).toBeVisible();
    await input.press('Enter');
    const first = page.getByRole('textbox', { name: '第 1 行计算公式' });
    await expect(first).toHaveValue('1+1');
    await expect(page.locator('output').first()).toHaveText('2');
    await expect(first).toBeFocused();
    await page.keyboard.insertText('+3');
    await expect(first).toHaveValue('1+1+3');
    await expect(page.locator('output').first()).toHaveText('5');
    await page.keyboard.press('Enter');
    const second = page.getByRole('textbox', { name: '第 2 行计算公式' });
    await expect(second).toBeFocused();
    await expect(second).toHaveValue('5');
    await page.keyboard.insertText('*2');
    await expect(second).toHaveValue('5*2');
    await expect(page.locator('output').nth(1)).toHaveText('10');
  });
}

test('列表刷新时静止的鼠标不覆盖键盘默认选中项，实际移动仍可选择', async () => {
  const page = await app.firstWindow();
  await page.evaluate(() =>
    window.nexlet.call('commandConfig', { action: 'layout', value: 'list' }),
  );
  const input = page.locator('.launcher-input');
  await input.fill('1+');
  const translation = page.locator(
    '[data-command-id="plugin:org.nexlet.text-match-fixture:translate"]',
  );
  const clipboard = page.locator('[data-command-id="match:clipboard"]');
  await input.hover();
  await clipboard.hover();
  await expect(clipboard).toHaveClass(/selected/);
  await input.press('ArrowUp');
  await expect(translation).toHaveClass(/selected/);
  await input.fill('1+1');
  const calculation = page.locator('[data-command-id="match:calc"]');
  await expect(calculation).toBeVisible();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(calculation).toHaveClass(/selected/);
  // Windows can synthesize a zero-movement event after the window resizes.
  await clipboard.dispatchEvent('mousemove', { movementX: 0, movementY: 0 });
  await expect(calculation).toHaveClass(/selected/);
  await input.hover();
  await clipboard.hover();
  await expect(clipboard).toHaveClass(/selected/);
});
