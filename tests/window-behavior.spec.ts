import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';

function environment(data: string): Record<string, string> {
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    NEXLET_TEST_MODE: '1',
    NEXLET_USER_DATA: data,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

for (const autostart of [false, true]) {
  test(`macOS ${autostart ? '登录' : '普通'}启动隐藏 Dock，重复唤起仍可输入`, async () => {
    test.skip(process.platform !== 'darwin', 'Dock 仅适用于 macOS');
    await mkdir('.tmp', { recursive: true });
    const data = await mkdtemp(path.resolve('.tmp/window-dock-'));
    const app = await electron.launch({
      args: [process.cwd(), ...(autostart ? ['--autostart'] : [])],
      env: environment(data),
    });
    try {
      const page = await app.firstWindow();
      const search = page.locator('.launcher-input');
      await expect(search).toBeAttached();
      await expect.poll(() => app.evaluate(({ app }) => app.dock!.isVisible())).toBe(false);
      expect(await app.evaluate(() => (globalThis as any).__nexlet.main.isVisible())).toBe(
        !autostart,
      );
      for (let attempt = 0; attempt < 2; attempt++) {
        await app.evaluate(async () => {
          const nexlet = (globalThis as any).__nexlet;
          nexlet.main.hide();
          await nexlet.show();
        });
        await expect(search).toBeVisible();
        await expect
          .poll(() => app.evaluate(() => (globalThis as any).__nexlet.main.isFocused()))
          .toBe(true);
        await expect(search).toBeFocused();
        await search.fill('json');
        await expect(search).toHaveValue('json');
        await search.fill('');
        expect(await app.evaluate(({ app }) => app.dock!.isVisible())).toBe(false);
      }
    } finally {
      await app.close();
    }
  });
}

test('工具标题和独立拖动区可拖动，交互控件仍可点击', async () => {
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.resolve('.tmp/window-drag-'));
  const env = environment(data);
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('textbox', { name: '搜索功能、应用或快捷方式' })).toBeVisible();
    await expect(page.getByLabel('拖动窗口')).toBeVisible();
    await expect(page.getByLabel('拖动窗口')).toHaveCSS('-webkit-app-region', 'no-drag');
    await expect(page.locator('.launcher-input')).toHaveCSS('-webkit-app-region', 'no-drag');
    await app.evaluate(() =>
      (globalThis as any).__nexlet.main.webContents.send('host-change', 'navigate:json'),
    );
    await expect(page.locator('.plugin-pill')).toHaveCSS('-webkit-app-region', 'drag');
    await expect(page.getByRole('button', { name: '关闭当前工具' })).toHaveCSS(
      '-webkit-app-region',
      'no-drag',
    );
    await page.getByRole('button', { name: '关闭当前工具' }).click();
    await expect(page.locator('.launcher-input')).toBeVisible();
  } finally {
    await app.close();
  }
});

test('首页整条搜索栏可拖动，点击和搜索输入保持可用', async () => {
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.resolve('.tmp/window-titlebar-'));
  const app = await electron.launch({ args: [process.cwd()], env: environment(data) });
  try {
    const page = await app.firstWindow();
    const search = page.locator('.launcher-input');
    await expect(search).toBeVisible();
    const position = () => app.evaluate(() => (globalThis as any).__nexlet.main.getPosition());
    // Use screen coordinates so moving the window cannot feed back into the drag delta.
    const gesture = async (selector: string, dx: number, dy: number) => {
      await page.locator(selector).evaluate(
        (element, { dx, dy }) => {
          const emit = (type: string, x: number, y: number, buttons: number) =>
            element.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true,
                button: 0,
                buttons,
                screenX: x,
                screenY: y,
              }),
            );
          emit('pointerdown', 400, 200, 1);
          emit('pointermove', 400 + dx, 200 + dy, 1);
          emit('pointerup', 400 + dx, 200 + dy, 0);
          element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        },
        { dx, dy },
      );
    };
    await search.click();
    await expect(search).toBeFocused();
    await search.fill('拖动后保留搜索');
    for (const selector of [
      '.window-drag-handle',
      '.launcher-input',
      '.titlebar-spacer',
      '.brand-button img',
      '.titlebar',
    ]) {
      const [x, y] = await position();
      await gesture(selector, 24, 12);
      await expect.poll(position).toEqual([x + 24, y + 12]);
      await expect(search).toHaveValue('拖动后保留搜索');
    }
    const before = await position();
    await gesture('.launcher-input', 2, 1);
    expect(await position()).toEqual(before);
    for (const selector of ['.launcher-input', '.brand-button']) {
      const target = page.locator(selector);
      const bounds = (await target.boundingBox())!;
      const [x, y] = await position();
      // Keep CDP mouse coordinates inside the viewport for the right-edge button.
      const dx = selector === '.brand-button' ? -30 : 30;
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width / 2 + dx, bounds.y + bounds.height / 2 + 15);
      await page.mouse.up();
      await expect.poll(position).toEqual([x + dx, y + 15]);
      await expect(search).toHaveValue('拖动后保留搜索');
    }
    await search.fill('');
    await search.pressSequentially('json');
    await expect(search).toHaveValue('json');
    await page.getByRole('button', { name: '打开设置' }).click();
    await expect(page.locator('.app-shell')).toHaveClass(/view-settings/);
  } finally {
    await app.close();
  }
});

test('最小化后唤起和重复启动都恢复窗口并取得焦点', async () => {
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.resolve('.tmp/window-focus-'));
  const env = environment(data);
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('.launcher-input')).toBeVisible();
    for (const entry of ['show', 'second-instance', 'activate', 'restore']) {
      await app.evaluate(() => (globalThis as any).__nexlet.main.minimize());
      await expect
        .poll(() => app.evaluate(() => (globalThis as any).__nexlet.main.isMinimized()))
        .toBe(true);
      await app.evaluate(async ({ app }, entry) => {
        if (entry === 'show') await (globalThis as any).__nexlet.show();
        else if (entry === 'restore') (globalThis as any).__nexlet.main.restore();
        else app.emit(entry as any, {} as any, [], process.cwd());
      }, entry);
      await expect
        .poll(() =>
          app.evaluate(() => {
            const w = (globalThis as any).__nexlet.main;
            return {
              minimized: w.isMinimized(),
              visible: w.isVisible(),
              focused: w.isFocused(),
              topmost: w.isAlwaysOnTop(),
            };
          }),
          { message: `唤起入口：${entry}` },
        )
        .toEqual({ minimized: false, visible: true, focused: true, topmost: false });
    }
  } finally {
    await app.close();
  }
});

test('登录启动留在后台，手动唤起后显示，自启动开关读回系统状态', async () => {
  await mkdir('.tmp', { recursive: true });
  const data = await mkdtemp(path.resolve('.tmp/window-login-'));
  const env = environment(data);
  const app = await electron.launch({ args: [process.cwd(), '--autostart'], env });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState();
    await expect(page.locator('.launcher-input')).toBeAttached();
    expect(await app.evaluate(() => (globalThis as any).__nexlet.main.isVisible())).toBe(false);
    await app.evaluate(() => (globalThis as any).__nexlet.show());
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__nexlet.main.isFocused()))
      .toBe(true);
    await app.evaluate(() =>
      (globalThis as any).__nexlet.main.webContents.send('host-change', 'navigate:settings'),
    );
    await expect(page.getByRole('switch', { name: '开机自启动', exact: true })).toBeDisabled();
    // Only the OS boundary is replaced: never add a real startup entry while testing.
    await app.evaluate(({ app }) => {
      Object.defineProperty(app, 'isPackaged', { configurable: true, value: true });
      let enabled = false;
      (globalThis as any).__loginWrites = [];
      app.getLoginItemSettings = (() => ({
        openAtLogin: enabled,
        executableWillLaunchAtLogin: enabled,
      })) as any;
      app.setLoginItemSettings = (options: any) => {
        enabled = options.openAtLogin;
        (globalThis as any).__loginWrites.push(options);
      };
      (globalThis as any).__nexlet.main.emit('focus');
    });
    const toggle = page.getByRole('switch', { name: '开机自启动', exact: true });
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(
      await app.evaluate(() => (globalThis as any).__loginWrites.map((v: any) => v.openAtLogin)),
    ).toEqual([true, false]);
  } finally {
    await app.close();
  }
});
