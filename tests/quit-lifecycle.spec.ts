import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

for (const trigger of ['api', 'mac-native'] as const) {
  test(`${trigger} quit exits the process after asynchronous cleanup`, async () => {
    test.skip(trigger === 'mac-native' && process.platform !== 'darwin');
    const directory = await mkdtemp(path.join(tmpdir(), 'nexlet-quit-'));
    const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), NEXLET_TEST_MODE: '1', NEXLET_USER_DATA: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    const application = await electron.launch({ args: [process.env.NEXLET_QUIT_TEST_APP || process.cwd()], env });
    const child = application.process();
    let stderr = '';
    child.stderr?.on('data', chunk => { stderr += String(chunk); });
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    try {
      const page = await application.firstWindow();
      await expect(page.getByLabel('搜索功能、应用或快捷方式')).toBeVisible();
      await application.evaluate(({ app, Menu }, trigger) => {
        const phases: string[] = [];
        app.prependListener('before-quit', () => {
          if (phases.length === 0) {
            phases.push('request');
            setImmediate(() => phases.push('native-cancellation-returned'));
          } else phases.push('final-quit');
        });
        app.once('will-quit', () => console.error('QUIT_PHASES ' + JSON.stringify(phases)));
        // Cover both the API and native menu-action entry points. Real Cmd+Q is
        // also checked manually: AppKit must finish canceling its first request.
        setTimeout(() => trigger === 'mac-native' ? Menu.sendActionToFirstResponder('terminate:') : app.quit(), 50);
      }, trigger);
      await expect.poll(() => child.exitCode, { timeout: 5000 }).toBe(0);
      expect(await exited).toEqual({ code: 0, signal: null });
      expect(stderr).toContain('QUIT_PHASES ["request","native-cancellation-returned","final-quit"]');
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited;
      await rm(directory, { recursive: true, force: true });
    }
  });
}
