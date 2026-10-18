import { afterEach, expect, it } from 'vite-plus/test';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.resolve('scripts/sync-plugin-sdk.mjs');
const compiler = fileURLToPath(
  new URL('./bin/tsc', import.meta.resolve('typescript/package.json')),
);
const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function directory() {
  mkdirSync('.tmp', { recursive: true });
  const folder = mkdtempSync(path.resolve('.tmp', 'sdk sync-'));
  folders.push(folder);
  return folder;
}

it('generates usable public SDK declarations with the installed compiler into an explicit destination', () => {
  const folder = directory();
  const destination = path.join(folder, 'generated sdk');
  const result = spawnSync(process.execPath, [script, destination], {
    cwd: folder,
    encoding: 'utf8',
  });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  const declaration = readFileSync(path.join(destination, 'extensions.d.ts'), 'utf8');
  expect(declaration).toMatch(/^\/\/ Generated from Nexlet\/src\/shared\/plugin-api\.ts\.\r?\n/);
  expect(declaration).toContain('declare const SDK_PERMISSIONS:');
  expect(declaration).not.toContain('export declare const SDK_PERMISSIONS:');
  expect(readFileSync(path.join(destination, 'index.d.ts'), 'utf8')).toBe(
    readFileSync('sdk/index.d.ts', 'utf8'),
  );
  writeFileSync(
    path.join(folder, 'consumer.ts'),
    `import type { PluginApi, SdkPermission } from './generated sdk/index';
declare const api: PluginApi;
const permission: SdkPermission = 'files';
const locale: Promise<'zh-CN' | 'zh-Hant' | 'en'> = api.i18n.getLocale();
// @ts-expect-error Unknown permissions must remain rejected by the generated contract.
const invalid: SdkPermission = 'unknown.permission';
void [permission, locale, invalid];
`,
  );
  const config = path.join(folder, 'tsconfig.json');
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: {
        target: 'ES2023',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        noEmit: true,
        strict: true,
        types: [],
      },
      files: ['consumer.ts'],
    }),
  );
  const check = spawnSync(process.execPath, [compiler, '--project', config], {
    encoding: 'utf8',
  });
  expect(check.status, check.stdout + check.stderr).toBe(0);
}, 15000);

function brokenFixture(source: string, includeIndex = true) {
  const folder = directory();
  const root = path.join(folder, 'fixture');
  const destination = path.join(folder, 'existing sdk');
  const temporary = path.join(folder, 'temporary');
  for (const name of ['scripts', 'src/shared', 'sdk'])
    mkdirSync(path.join(root, name), { recursive: true });
  mkdirSync(destination);
  mkdirSync(temporary);
  copyFileSync(script, path.join(root, 'scripts/sync-plugin-sdk.mjs'));
  writeFileSync(path.join(root, 'src/shared/plugin-api.ts'), source);
  if (includeIndex)
    writeFileSync(path.join(root, 'sdk/index.d.ts'), 'export type Existing = true;');
  writeFileSync(path.join(destination, 'extensions.d.ts'), 'existing extensions');
  writeFileSync(path.join(destination, 'index.d.ts'), 'existing index');
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'scripts/sync-plugin-sdk.mjs'), destination],
    {
      cwd: folder,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
    },
  );
  expect(result.status).not.toBe(0);
  expect(readFileSync(path.join(destination, 'extensions.d.ts'), 'utf8')).toBe(
    'existing extensions',
  );
  expect(readFileSync(path.join(destination, 'index.d.ts'), 'utf8')).toBe('existing index');
  expect(readdirSync(temporary)).toEqual([]);
  return result;
}

it('reports compiler errors and leaves existing SDK files intact while cleaning temporary output', () => {
  const result = brokenFixture('export const broken: string = 42;');
  expect(result.stdout + result.stderr).toContain('TS2322');
}, 15000);

it('does not replace existing SDK files when the public index cannot be read', () => {
  const result = brokenFixture('export interface Example { value: string }', false);
  expect(result.stdout + result.stderr).toContain('ENOENT');
}, 15000);
