import { _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
await mkdir('.tmp', { recursive: true });
const data = await mkdtemp(path.resolve('.tmp', 'market-live-'));
const env = {
  ...process.env,
  NEXLET_TEST_MODE: '1',
  NEXLET_TEST_LOCALE: 'zh-CN',
  NEXLET_USER_DATA: data,
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [process.cwd()], env });
try {
  const page = await app.firstWindow();
  await page.getByRole('textbox', { name: '搜索功能、应用或快捷方式' }).waitFor();
  const market = await page.evaluate(() => window.nexlet.call('marketplace', true));
  if (market.error || !market.entries.length) throw Error(market.error || 'Empty marketplace');
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  });
  const id = market.entries[0].id;
  const installed = await page.evaluate((id) => window.nexlet.call('marketInstall', id), id);
  if (!installed) throw Error('Installation cancelled');
  const records = await page.evaluate(() => window.nexlet.call('pluginInspect'));
  if (records[0].source !== 'marketplace' || !records[0].icon?.startsWith('data:image/png'))
    throw Error('Invalid install record or missing icon');
  await page.getByRole('textbox', { name: '搜索功能、应用或快捷方式' }).fill('插件管理');
  await page.getByRole('button', { name: '插件管理', exact: true }).click();
  await page.getByRole('button', { name: '打开', exact: true }).waitFor();
  await page.screenshot({ path: 'test-results/marketplace-live.png' });
  const popup = app.waitForEvent('window');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  const plugin = await popup;
  await plugin.getByRole('textbox', { name: '便笺内容' }).fill('从公开 GitHub 插件市场安装成功');
  await plugin.locator('#status').filter({ hasText: '已保存' }).waitFor();
  console.log(
    JSON.stringify(
      {
        market: 'live GitHub index',
        download: market.entries[0].download,
        plugin: records[0].manifest.id,
        version: records[0].manifest.version,
        source: records[0].source,
        icon: 'present',
        interaction: 'note saved',
      },
      null,
      2,
    ),
  );
} finally {
  await app.close();
}
