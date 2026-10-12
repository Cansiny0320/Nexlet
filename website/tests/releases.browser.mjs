import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { RELEASE_API } from '../assets/releases.mjs';
import { releaseFixture } from './release-fixture.mjs';

const fallback = JSON.parse(await readFile(new URL('../downloads.json', import.meta.url), 'utf8'));
let server, browser, base;
before(async () => {
  server = spawn(process.execPath, [new URL('../scripts/serve.mjs', import.meta.url).pathname], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Preview did not start')), 5000);
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.stdout.on('data', data => {
      const url = data.toString().match(/Local: (http:\/\/[^\s]+)/)?.[1];
      if (url) { clearTimeout(timer); resolve(url); }
    });
  });
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
});
after(async () => { await browser?.close(); server?.kill(); });

test('download page updates all links and version together without downloading files', async () => {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route(RELEASE_API, route => route.fulfill({ json: releaseFixture() }));
  await page.goto(base + '/download/');
  await page.getByText('最新正式版', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-release-version]').textContent(), '9.9.9');
  for (const link of await page.locator('[data-direct-download], [data-checksums-link]').all()) {
    assert.match(await link.getAttribute('href'), /\/download\/v9\.9\.9\//);
  }
  assert.match(await page.locator('[data-release-link]').getAttribute('href'), /\/tag\/v9\.9\.9$/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('late Release and architecture responses preserve the manual platform in both homepage controls', async () => {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgentData', { value: {
      platform: 'macOS', mobile: false, getHighEntropyValues: () => new Promise(resolve => { window.resolvePlatform = resolve; })
    }});
    Object.defineProperty(navigator, 'userAgent', { value: 'Macintosh; Intel Mac OS X' });
  });
  let respond;
  const requested = new Promise(resolve => { respond = resolve; });
  await page.route(RELEASE_API, route => { respond(route); });
  await page.goto(base + '/');
  const request = await requested;
  await page.locator('.download-toggle').first().click();
  await page.locator('#hero-downloads [data-platform="macos-x64"]').click();
  await page.evaluate(() => window.resolvePlatform({ architecture: 'arm', bitness: '64' }));
  await request.fulfill({ json: releaseFixture() });
  await page.getByText('最新正式版', { exact: true }).first().waitFor();
  for (const link of await page.locator('[data-primary-download]').all()) {
    assert.match(await link.getAttribute('href'), /v9\.9\.9\/Nexlet-9\.9\.9-macOS-x64\.dmg$/);
  }
  await page.locator('.download-toggle').first().click();
  await page.locator('#hero-downloads [data-platform="windows-x64"]').click();
  assert.match(await page.locator('[data-primary-download]').first().getAttribute('href'), /v9\.9\.9\/Nexlet-9\.9\.9-Windows-x64\.exe$/);
  await page.close();
});

test('unknown platform keeps the selection entry after refreshing', async () => {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgentData', { value: undefined });
    Object.defineProperty(navigator, 'userAgent', { value: 'Unknown' });
    Object.defineProperty(navigator, 'platform', { value: '' });
  });
  await page.route(RELEASE_API, route => route.fulfill({ json: releaseFixture() }));
  await page.goto(base + '/');
  await page.getByText('最新正式版', { exact: true }).first().waitFor();
  assert.equal(await page.locator('[data-primary-download]').first().getAttribute('href'), '/download/');
  await page.close();
});

test('rate limits, network errors, invalid JSON and incomplete releases retain the entire fallback', async () => {
  const incomplete = releaseFixture(); incomplete.assets.pop();
  for (const reply of [route => route.fulfill({ status: 403, json: {} }), route => route.abort(),
    route => route.fulfill({ body: 'invalid JSON' }), route => route.fulfill({ json: incomplete })]) {
    const page = await browser.newPage();
    await page.route(RELEASE_API, reply);
    await page.goto(base + '/download/');
    await page.getByText('暂未获取到最新版本，以下为已知可用版本', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-release-version]').textContent(), fallback.version);
    for (const [key, platform] of Object.entries(fallback.platforms)) {
      assert.equal(await page.locator(`[data-direct-download="${key}"]`).getAttribute('href'), platform.url);
    }
    assert.equal(await page.locator('[data-checksums-link]').getAttribute('href'), fallback.checksumsUrl);
    assert.equal(await page.locator('[data-release-link]').getAttribute('href'), fallback.releaseUrl);
    await page.close();
  }
});

test('no JavaScript retains versioned direct downloads and matching checksums', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(base + '/download/');
  assert.equal(await page.locator('[data-direct-download]').count(), 3);
  assert.equal(await page.locator('[data-release-version]').textContent(), fallback.version);
  assert.equal(await page.locator('[data-checksums-link]').getAttribute('href'), fallback.checksumsUrl);
  await context.close();
});

test('version and failure text fit desktop and mobile layouts', async () => {
  const page = await browser.newPage();
  await page.route(RELEASE_API, route => route.fulfill({ status: 403, json: {} }));
  await mkdir(new URL('../.qa/', import.meta.url), { recursive: true });
  for (const width of [320, 390, 768, 1065, 1107, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/download/']) {
      await page.goto(base + route);
      await page.getByText('暂未获取到最新版本，以下为已知可用版本', { exact: true }).first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (route === '/') {
        for (const hint of await page.locator('.hero-heading .download-hint').all()) {
          const text = await hint.boundingBox();
          for (const card of await page.locator('.product-showcase .mock-window').all()) {
            const box = await card.boundingBox();
            const overlaps = text.x < box.x + box.width && text.x + text.width > box.x && text.y < box.y + box.height && text.y + text.height > box.y;
            assert(!overlaps, `Download text overlaps artwork at ${width}px: ${JSON.stringify({ text, box })}`);
          }
        }
      }
      if (width === 390) await page.screenshot({ path: new URL(`../.qa/releases-${route === '/' ? 'home' : 'download'}.png`, import.meta.url).pathname, fullPage: true });
    }
  }
  await page.close();
});
