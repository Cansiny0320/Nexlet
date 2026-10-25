import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

test('shared models, sandboxed OCR and screenshot redaction work without desktop interaction', async () => {
  test.setTimeout(120000);
  const directory = await mkdtemp(path.join(tmpdir(), 'nexlet-alignment-'));
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    NEXLET_TEST_MODE: '1',
    NEXLET_USER_DATA: directory,
    NEXLET_TEST_DEFER_CATALOG_SCAN: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [path.resolve('tests/helpers/hidden-electron.cjs')],
    env,
  });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => !!window.nexlet);
    await expect.poll(() => app.evaluate(() => !!(globalThis as any).__nexlet)).toBe(true);
    await page.evaluate(() =>
      window.nexlet.call('aiSettings', {
        action: 'save',
        provider: {
          id: 'test',
          name: 'Test',
          protocol: 'responses',
          baseUrl: 'https://example.invalid/v1',
          models: ['fixture'],
          maxOutputTokens: 100,
          capabilities: { images: false, tools: false },
        },
      }),
    );
    const ai = await page.evaluate(() =>
      window.nexlet.call('aiSettings', {
        action: 'default',
        value: { providerId: 'test', model: 'fixture' },
      }),
    );
    expect(ai.defaultModel?.model).toBe('fixture');
    await app.evaluate(async ({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, path.resolve('../Nexlet-plugins/.build/plugins/ocr'));
    await page.evaluate(() => window.nexlet.call('pluginInstall', { development: true }));
    const providers = await page.evaluate(() =>
      window.nexlet.call('capabilitySettings', {
        action: 'default',
        capability: 'ocr',
        id: 'org.nexlet.ocr:paddle',
      }),
    );
    expect(providers.providers[0].locality).toBe('local');
    const input = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 700;
      canvas.height = 150;
      const c = canvas.getContext('2d')!;
      c.fillStyle = '#fff';
      c.fillRect(0, 0, 700, 150);
      c.fillStyle = '#000';
      c.font = '48px Arial';
      c.fillText('Nexlet OCR 12345', 20, 85);
      return canvas.toDataURL().split(',')[1];
    });
    const result = await app.evaluate(async (_electron, data) => {
      const n = (globalThis as any).__nexlet;
      return n.plugins.sdk.capabilities.run(
        { capability: 'ocr', image: new Uint8Array(Buffer.from(data, 'base64')) },
        AbortSignal.timeout(60000),
      );
    }, input);
    expect(result.text).toContain('12345');
    expect(result.blocks.length).toBeGreaterThan(0);
    const bitmap = await sharp({
      create: { width: 100, height: 100, channels: 4, background: '#ff0000' },
    })
      .png()
      .toBuffer();
    await app.evaluate(({ desktopCapturer, nativeImage, screen, systemPreferences }, data) => {
      const display = screen.getPrimaryDisplay();
      systemPreferences.getMediaAccessStatus = () => 'granted';
      desktopCapturer.getSources = async () => [
        {
          id: 'screen:fixture',
          display_id: String(display.id),
          name: 'Fixture',
          thumbnail: nativeImage.createFromBuffer(Buffer.from(data, 'base64')),
          appIcon: nativeImage.createEmpty(),
        },
      ];
      const n = (globalThis as any).__nexlet;
      (globalThis as any).__captureFinished = n.desktopTools.capture.start(
        'region',
        'launcher',
        async (bytes: Buffer) => {
          (globalThis as any).__captureOutput = bytes.toString('base64');
        },
      );
    }, bitmap.toString('base64'));
    await expect.poll(async () => (await app.windows()).length).toBeGreaterThan(1);
    const capture =
      (await app.windows()).find((p) => p.url().includes('desktop=capture')) ??
      (await app.waitForEvent('window'));
    await capture.waitForFunction(() => !!window.desktopTools);
    const state = await capture.evaluate(() => window.desktopTools.call<any>('state'));
    await capture.evaluate((rect) => window.desktopTools.call('edit', { rect }), state.bounds);
    await capture
      .evaluate(() =>
        window.desktopTools.call('complete', {
          annotations: [
            {
              id: 'redaction',
              kind: 'redact',
              x: 10,
              y: 10,
              width: 30,
              height: 30,
              color: '#000000',
              stroke: 2,
            },
          ],
        }),
      )
      .catch(() => {});
    const png = await app.evaluate(async () => {
      await (globalThis as any).__captureFinished;
      return (globalThis as any).__captureOutput;
    });
    const { data: pixels, info } = await sharp(Buffer.from(png, 'base64'))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([
      ...pixels.subarray((20 * info.width + 20) * 3, (20 * info.width + 20) * 3 + 3),
    ]).toEqual([0, 0, 0]);
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((w) => w.isVisible()),
      ),
    ).toBe(false);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
