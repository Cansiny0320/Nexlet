import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { releaseFixture } from './release-fixture.ts';
const base = process.env.SITE_URL;
let browser;
before(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
});
after(async () => {
  await browser?.close();
});
test('all nine routes serve their language and independent SEO without JavaScript', async () => {
  await Promise.all(
    ['zh-CN', 'en', 'zh-Hant'].flatMap((locale) =>
      ['/', '/download/', '/plugins/'].map(async (route) => {
        const path = (locale === 'zh-CN' ? '' : '/' + locale) + route;
        const response = await fetch(base + path);
        assert.equal(response.status, 200, path);
        const document = new JSDOM(await response.text()).window.document;
        assert.equal(document.documentElement.lang, locale);
        assert.equal(document.querySelectorAll('h1').length, 1);
        const social = document.querySelector('meta[property="og:image"]').content;
        assert.equal((await fetch(base + new URL(social).pathname)).status, 200);
        assert.equal(
          document.querySelector('link[rel="canonical"]').getAttribute('href'),
          'https://nexlet.cansiny0320.chatgpt.site' + path,
        );
        assert.equal(document.querySelectorAll('link[rel="alternate"][hreflang]').length, 4);
        if (locale === 'en')
          assert(
            !/[\p{Script=Han}]/u.test(document.querySelector('main').textContent),
            document.querySelector('main').textContent,
          );
      }),
    ),
  );
  for (const path of ['/en/missing/', '/zh-Hant/missing/', '/fr/']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404);
    const document = new JSDOM(await response.text()).window.document;
    assert.equal(document.querySelector('meta[name="robots"]').content, 'noindex');
  }
});
test('language links retain the page and switching never causes hydration errors', async () => {
  const context = await browser.newContext();
  await context.route('https://api.github.com/repos/Cansiny0320/Nexlet/releases/latest', (route) =>
    route.fulfill({ json: releaseFixture() }),
  );
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (/hydration|did not match/i.test(message.text())) errors.push(message.text());
  });
  await page.goto(base + '/plugins/');
  await page
    .locator('.language-switch')
    .getByRole('link', { name: 'English', exact: true })
    .click();
  await page.waitForURL('**/en/plugins/');
  await page.getByRole('heading', { name: 'Develop plugins', exact: true }).waitFor();
  await page
    .locator('.language-switch')
    .getByRole('link', { name: '繁體中文', exact: true })
    .click();
  await page.waitForURL('**/zh-Hant/plugins/');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const locale of ['en', 'zh-Hant'])
      for (const route of ['/', '/download/', '/plugins/']) {
        await page.goto(base + '/' + locale + route);
        await page.waitForFunction(() => document.documentElement.classList.contains('js'));
        assert(await page.locator('.language-switch').isVisible());
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
  }
  assert.deepEqual(errors, []);
  await context.close();
});
