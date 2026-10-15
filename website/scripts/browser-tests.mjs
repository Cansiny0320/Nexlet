import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
const root = fileURLToPath(new URL('..', import.meta.url));
let server;
let base = process.env.SITE_URL;
try {
  if (!base) {
    server = spawn(
      process.execPath,
      ['node_modules/vite-plus/bin/vp', '-C', '.', 'preview', '--host', '127.0.0.1', '--port', '0'],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    base = await new Promise((resolve, reject) => {
      let log = '';
      const timeout = setTimeout(
        () => reject(new Error(`Worker preview timed out: ${log}`)),
        30000,
      );
      server.once('error', reject);
      server.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Worker preview exited ${code}: ${log}`));
      });
      for (const stream of [server.stdout, server.stderr])
        stream.on('data', (data) => {
          log += stripVTControlCharacters(data.toString());
          const url = log.match(/Local:\s+(http:\/\/[^\s]+)/)?.[1];
          if (url) {
            clearTimeout(timeout);
            resolve(url.replace(/\/$/, ''));
          }
        });
    });
  }
  console.log(`Testing built Worker: ${base}`);
  const tests = spawn(
    process.execPath,
    [
      '--test',
      '--test-concurrency=1',
      'tests/releases.browser.mjs',
      'tests/site.browser.mjs',
      'tests/i18n.browser.mjs',
    ],
    {
      cwd: root,
      env: { ...process.env, SITE_URL: base },
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  process.exitCode = await new Promise((resolve, reject) => {
    tests.once('error', reject);
    tests.once('exit', (code) => resolve(code ?? 1));
  });
} finally {
  if (server?.pid) {
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    else server.kill();
  }
}
