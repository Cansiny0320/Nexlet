// Generates localized social cards from the actual isolated desktop captures.
import { chromium } from 'playwright';
import { readFile, copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  const icon = (await readFile(path.join(root, 'public/assets/icon.png'))).toString('base64');
  for (const [locale, title, detail] of [
    ['en', 'Your tools.<br>One shortcut<br>away.', 'Search · Clipboard · Scratchpad · Plugins'],
    ['zh-Hant', '常用工具，<br>隨時在手邊。', '搜尋 · 剪貼簿 · 計算草稿 · 外掛'],
  ]) {
    const shot = path.resolve(root, `../docs/screenshots/${locale}/launcher.png`);
    await copyFile(shot, path.join(root, `public/assets/launcher-${locale}.png`));
    const image = (await readFile(shot)).toString('base64');
    await page.setContent(`<!doctype html><html lang="${locale}"><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;background:#f6f4ff;color:#242a35;font-family:Arial,"PingFang TC",sans-serif;width:1200px;height:630px;overflow:hidden;padding:54px 64px}
  header{display:flex;align-items:center;gap:12px;font-size:28px;font-weight:700;letter-spacing:-1px}header img{width:45px;height:45px}small{font-size:12px;letter-spacing:2px;color:#687260;font-weight:600;margin-left:auto}
  h1{width:340px;font-size:48px;line-height:1.13;letter-spacing:-2px;margin:42px 0 22px;font-weight:600}p{font-size:15px;color:#6a6e73;line-height:1.7;width:300px}
  .app{position:absolute;left:430px;top:204px;width:750px;border-radius:12px;box-shadow:0 22px 65px #303a3920;border:1px solid #dddcd5}footer{position:absolute;left:64px;bottom:44px;font-size:13px;color:#687260;letter-spacing:.3px}.badge{display:inline-block;border:1px solid #b9c1b0;border-radius:20px;padding:8px 13px;font-size:12px;margin-top:12px}
  </style><header><img src="data:image/png;base64,${icon}" alt="">Nexlet<small>OPEN SOURCE DESKTOP TOOLBOX</small></header><h1>${title}</h1><p>${detail}</p><span class="badge">Windows · macOS</span><img class="app" src="data:image/png;base64,${image}" alt="Nexlet"><footer>github.com/Cansiny0320/Nexlet</footer></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(root, `public/assets/social-${locale}.png`) });
  }
  const base = process.env.SITE_URL;
  if (base) {
    await page.route('https://api.github.com/**', (route) => route.abort());
    await mkdir(path.join(root, '.qa/i18n'), { recursive: true });
    for (const width of [1440, 390, 320])
      for (const locale of ['en', 'zh-Hant']) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(base + '/' + locale + '/');
        await page.waitForFunction(() => document.documentElement.classList.contains('js'));
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: path.join(root, `.qa/i18n/${locale}-${width}.png`),
          fullPage: true,
        });
      }
  }
} finally {
  await browser.close();
}
