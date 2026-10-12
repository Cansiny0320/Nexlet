import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';

let app: ElectronApplication, page: Page;

test.beforeEach(async () => {
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.resolve('.tmp', 'scratchpad-e2e-'));
  const env: Record<string, string> = {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    NEXLET_TEST_MODE: '1', NEXLET_USER_DATA: data,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [process.cwd()], env });
  page = await app.firstWindow();
  await page.getByRole('textbox', { name: '搜索功能、应用或快捷方式' }).fill('计算稿纸');
  await page.getByRole('button', { name: '计算稿纸', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '第 1 行计算公式' })).toBeVisible();
});

test.afterEach(async () => { await app?.close(); });

// Expose the interval between React committing the carried value and the next
// animation frame. Filling a textarea also selects text before inserting it.
async function holdAnimationFrames() {
  await page.evaluate(() => {
    const original = window.requestAnimationFrame;
    const callbacks: FrameRequestCallback[] = [];
    window.requestAnimationFrame = callback => callbacks.push(callback);
    (window as any).__resumeScratchpadFrames = () => {
      window.requestAnimationFrame = original;
      for (const callback of callbacks) callback(performance.now());
    };
  });
}

async function resumeAnimationFrames() {
  await page.evaluate(() => (window as any).__resumeScratchpadFrames());
}

test('续算后的延迟帧不会破坏全选替换', async ({}, testInfo) => {
  const first = page.getByRole('textbox', { name: '第 1 行计算公式' });
  const second = page.getByRole('textbox', { name: '第 2 行计算公式' });
  await first.fill('128*3');
  await expect(page.locator('output').first()).toHaveText('384');
  await holdAnimationFrames();
  await first.press('Enter');
  await expect(second).toHaveValue('384');
  const selected = await second.evaluate((input: HTMLTextAreaElement) => {
    input.focus(); input.select();
    return [input.selectionStart, input.selectionEnd];
  });
  await resumeAnimationFrames();
  const afterFrame = await second.evaluate((input: HTMLTextAreaElement) => [input.selectionStart, input.selectionEnd]);
  await page.keyboard.insertText('384+256');
  await testInfo.attach('selection-timing', {
    body: JSON.stringify({ selected, afterFrame, expression: await second.inputValue(), result: await page.locator('output').nth(1).innerText() }),
    contentType: 'application/json',
  });
  await expect(second).toHaveValue('384+256');
  await expect(page.locator('output').nth(1)).toHaveText('640');
});

test('续算后的延迟帧不会抢回用户已经移动的焦点', async () => {
  const first = page.getByRole('textbox', { name: '第 1 行计算公式' });
  const second = page.getByRole('textbox', { name: '第 2 行计算公式' });
  await first.fill('128*3');
  await holdAnimationFrames();
  await first.press('Enter');
  await expect(second).toHaveValue('384');
  await first.evaluate((input: HTMLTextAreaElement) => { input.focus(); input.setSelectionRange(1, 1); });
  await resumeAnimationFrames();
  await expect(first).toBeFocused();
  expect(await first.evaluate((input: HTMLTextAreaElement) => input.selectionStart)).toBe(1);
});

test('新稿纸、连续续算和上下行切换保持正确的焦点与光标', async () => {
  const first = page.getByRole('textbox', { name: '第 1 行计算公式' });
  const second = page.getByRole('textbox', { name: '第 2 行计算公式' });
  const third = page.getByRole('textbox', { name: '第 3 行计算公式' });
  // Exercise the original CI sequence without controlling the frame scheduler.
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.getByRole('button', { name: '新稿纸', exact: true }).click();
    await expect(first).toBeFocused();
    await first.fill('128*3');
    await first.press('Enter');
    await expect(second).toBeFocused();
    await expect(second).toHaveValue('384');
    expect(await second.evaluate((input: HTMLTextAreaElement) => [input.selectionStart, input.selectionEnd])).toEqual([3, 3]);
    await second.fill('384+256');
    await expect(second).toHaveValue('384+256');
    await expect(page.locator('output').nth(1)).toHaveText('640');
  }
  await second.press('Enter');
  await expect(third).toBeFocused();
  await expect(third).toHaveValue('640');
  await page.keyboard.insertText('+1');
  await expect(third).toHaveValue('640+1');
  await expect(page.locator('output').nth(2)).toHaveText('641');
  await third.press('ArrowUp');
  await expect(second).toBeFocused();
  expect(await second.evaluate((input: HTMLTextAreaElement) => [input.selectionStart, input.selectionEnd])).toEqual([7, 7]);
  await second.press('ArrowUp');
  await expect(first).toBeFocused();
  await first.evaluate((input: HTMLTextAreaElement) => input.setSelectionRange(0, 0));
  await first.press('ArrowUp');
  expect(await first.evaluate((input: HTMLTextAreaElement) => [input.selectionStart, input.selectionEnd])).toEqual([5, 5]);
  await first.press('ArrowDown');
  await expect(second).toBeFocused();
});
