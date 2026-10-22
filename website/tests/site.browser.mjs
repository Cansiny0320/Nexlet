import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { releaseFixture } from './release-fixture.ts';

const base = process.env.SITE_URL;
const origin = 'https://nexlet.cansiny0320.chatgpt.site';
const routes = ['/', '/download/', '/plugins/'];
const releaseApi = 'https://api.github.com/repos/Cansiny0320/Nexlet/releases/latest';
let browser;
before(async () => {
  assert(base, 'Use pnpm test:browser to launch the built Worker');
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
});
after(async () => {
  await browser?.close();
});
async function context(options = {}) {
  const result = await browser.newContext(options);
  await result.route(releaseApi, (route) => route.fulfill({ json: releaseFixture() }));
  return result;
}
async function go(page, route) {
  const response = await page.goto(base + route);
  await page.waitForFunction(() => document.documentElement.classList.contains('js'));
  return response;
}

test('built Worker serves complete SSR, SEO, local assets, robots, sitemap and real 404', async () => {
  const titles = new Set(),
    descriptions = new Set(),
    assets = new Set();
  for (const path of routes) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    const html = await response.text();
    const { document } = new JSDOM(html).window;
    assert.equal(document.documentElement.lang, 'zh-CN');
    assert.equal(document.querySelectorAll('h1').length, 1);
    assert(document.querySelector('main').textContent.trim().length > 100);
    assert(!html.includes('\uFFFD'));
    const title = document.title,
      description = document.querySelector('meta[name="description"]').content;
    assert(title && !titles.has(title));
    titles.add(title);
    assert(description && !descriptions.has(description));
    descriptions.add(description);
    assert.equal(document.querySelector('link[rel="canonical"]').href, origin + path);
    assert.equal(document.querySelector('meta[property="og:url"]').content, origin + path);
    assert.match(document.querySelector('meta[name="robots"]').content, /^index/);
    const structured = JSON.parse(
      document.querySelector('script[type="application/ld+json"]').textContent,
    );
    assert.equal(
      structured['@graph'].find((item) => item['@type'] === 'WebPage').url,
      origin + path,
    );
    assert(!/aggregateRating|reviewCount|ratingValue|downloadUrl/.test(JSON.stringify(structured)));
    for (const item of document.querySelectorAll(
      '[src], link[rel="stylesheet"], link[rel="icon"], link[rel="preload"]',
    )) {
      const url = item.getAttribute('src') || item.getAttribute('href');
      if (url?.startsWith('/')) assets.add(url);
    }
    for (const image of document.querySelectorAll('img')) {
      assert(image.hasAttribute('alt'));
      assert(Number(image.width) > 0);
      assert(Number(image.height) > 0);
    }
    const ids = Array.from(document.querySelectorAll('[id]'), (element) => element.id);
    assert.equal(ids.length, new Set(ids).size);
    for (const link of document.querySelectorAll('a[href^="#"]'))
      assert(document.getElementById(link.hash.slice(1)));
  }
  for (const asset of assets) assert.equal((await fetch(base + asset)).status, 200, asset);
  const robots = await fetch(base + '/robots.txt').then((r) => r.text());
  assert.match(robots, /Allow: \//);
  assert(robots.includes(origin + '/sitemap.xml'));
  const sitemap = await fetch(base + '/sitemap.xml').then((r) => r.text());
  for (const route of routes) assert(sitemap.includes(`<loc>${origin + route}</loc>`));
  const missing = await fetch(base + '/does-not-exist');
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /noindex/);
  const hosting = JSON.parse(
    await readFile(new URL('../dist/.openai/hosting.json', import.meta.url)),
  );
  assert.equal(hosting.project_id, 'appgprj_6acbbb32d78881919f324dcdf9ee6640');
  assert.equal(hosting.static, undefined);
  const worker = JSON.parse(
    await readFile(new URL('../dist/server/wrangler.json', import.meta.url)),
  );
  assert.equal(worker.main, 'index.js');
  assert.equal(worker.assets.directory, '../client');
});

test('client navigation updates SEO and supports refresh without hydration errors', async () => {
  const ctx = await context();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });
  await go(page, '/');
  for (const [route, label] of [
    ['/download/', '下载'],
    ['/plugins/', '插件开发'],
    ['/', '概览'],
  ]) {
    await page.locator('#navigation').getByRole('link', { name: label, exact: true }).click();
    await page.waitForURL(base + route);
    // Router commits the URL before its lazy route and head finish rendering.
    await page.waitForFunction(
      (url) => document.querySelector('link[rel="canonical"]')?.getAttribute('href') === url,
      origin + route,
      { timeout: 5000 },
    );
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), origin + route);
    assert.equal(await page.locator('script[type="application/ld+json"]').count(), 1);
    assert.equal(await page.locator('#navigation [aria-current="page"]').textContent(), label);
    assert.equal((await page.reload()).status(), 200);
    await page.waitForFunction(() => document.documentElement.classList.contains('js'));
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('download menu supports keyboard, shared choice, Escape and outside dismissal', async () => {
  const ctx = await context();
  const page = await ctx.newPage();
  await go(page, '/');
  const trigger = page.locator('.download-toggle').first();
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await page.locator('#hero-downloads [data-platform="windows-x64"]:focus').waitFor();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  for (const anchor of await page.locator('[data-primary-download]').all())
    assert.match(await anchor.getAttribute('href'), /macOS-arm64\.dmg$/);
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  await trigger.click();
  await page.keyboard.press('Escape');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  assert(await trigger.evaluate((el) => el === document.activeElement));
  await trigger.click();
  await page.locator('h1').click();
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  await ctx.close();
});

test('Mac first-open instructions stay collapsed until requested, including without JavaScript', async () => {
  for (const javaScriptEnabled of [true, false]) {
    const ctx = await context({ javaScriptEnabled });
    const page = await ctx.newPage();
    await page.goto(base + '/download/');
    if (javaScriptEnabled)
      await page.waitForFunction(() => document.documentElement.classList.contains('js'));
    const guide = page.locator('details.mac-first-open');
    assert.equal(await guide.getAttribute('open'), null);
    await page.locator('.mac-first-open-hint a').click();
    await page.locator('#mac-first-open').waitFor({ state: 'visible' });
    assert.equal(await guide.getAttribute('open'), '');
    assert.equal(await guide.locator('li').count(), 4);
    await guide.locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await guide.getAttribute('open'), null);
    await ctx.close();
  }
});

test('mobile navigation, skip link, FAQ and clipboard success/failure remain accessible', async () => {
  const ctx = await context({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await go(page, '/');
  await page.keyboard.press('Tab');
  assert(await page.locator('.skip-link').evaluate((el) => el === document.activeElement));
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#main');
  const menu = page.getByRole('button', { name: /菜单/ });
  await menu.click();
  assert.equal(await menu.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  assert(await menu.evaluate((el) => el === document.activeElement));
  await menu.click();
  await page.locator('#navigation').getByRole('link', { name: '下载', exact: true }).click();
  await page.waitForURL(base + '/download/');
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  await page.locator('summary').first().focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('details').first().getAttribute('open'), '');
  await go(page, '/plugins/');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copied = text;
        },
      },
    }),
  );
  await page.getByRole('button', { name: '复制存储 API' }).click();
  assert.equal(await page.evaluate(() => window.copied), 'nexlet.storage');
  await page.getByText('已复制到剪贴板', { exact: true }).waitFor();
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    }),
  );
  await page.getByRole('button', { name: '复制存储 API' }).click();
  await page.getByText('复制未成功，请选中文字后手动复制', { exact: true }).waitFor();
  await ctx.close();
});

test('three pages remain usable without JavaScript and fit all supported viewports', async () => {
  const plain = await context({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const plainPage = await plain.newPage();
  for (const route of routes) {
    await plainPage.goto(base + route);
    assert(await plainPage.locator('#navigation').isVisible());
    assert(await plainPage.locator('h1').isVisible());
  }
  await plain.close();
  const ctx = await context();
  const page = await ctx.newPage();
  const errors = [],
    dimensions = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().startsWith(base) && response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  await mkdir(new URL('../.qa/migrated/', import.meta.url), { recursive: true });
  for (const width of [320, 390, 768, 1065, 1107, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await go(page, route);
      await page.evaluate(() => document.fonts.ready);
      const size = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      assert(size.scroll <= width, `${route} overflows at ${width}px`);
      dimensions.push({ route, ...size });
      if ([390, 1440].includes(width))
        await page.screenshot({
          path: fileURLToPath(
            new URL(
              `../.qa/migrated/${route.replaceAll('/', '') || 'home'}-${width}.png`,
              import.meta.url,
            ),
          ),
          fullPage: true,
        });
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('../.qa/browser-results.json', import.meta.url),
    JSON.stringify({ status: 'passed', base, dimensions }, null, 2),
  );
  await ctx.close();
});
