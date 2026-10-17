import { afterEach, expect, it } from 'vite-plus/test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

it('validates release tags against the manifest without requiring a root version in the pnpm lock', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'nexlet-ci-metadata-'));
  folders.push(folder);
  writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  writeFileSync(
    path.join(folder, 'pnpm-lock.yaml'),
    "lockfileVersion: '9.0'\nimporters:\n  .: {}\n",
  );
  const run = (tag: string) =>
    spawnSync(process.execPath, [path.resolve('scripts/ci-metadata.mjs')], {
      cwd: folder,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: tag, GITHUB_OUTPUT: '' },
    });
  const valid = run('v1.2.3');
  expect(valid.status).toBe(0);
  expect(JSON.parse(valid.stdout)).toEqual({ version: '1.2.3', tag: 'v1.2.3' });
  const mismatch = run('v1.2.4');
  expect(mismatch.status).not.toBe(0);
  expect(mismatch.stderr).toContain('must match package version');
});
