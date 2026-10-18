import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.resolve(root, process.argv[2] || '../Nexlet-plugins/sdk');
const file = path.join(root, 'src/shared/plugin-api.ts');
const compiler = fileURLToPath(
  new URL('./bin/tsc', import.meta.resolve('typescript/package.json')),
);
const temporary = await mkdtemp(path.join(tmpdir(), 'nexlet-sdk-'));
try {
  // TypeScript 7 no longer exposes the old createProgram API from its root.
  // Compile away from the destination so diagnostics cannot replace a working SDK.
  execFileSync(
    process.execPath,
    [
      compiler,
      '--ignoreConfig',
      '--target',
      'ES2023',
      '--module',
      'ESNext',
      '--moduleResolution',
      'Bundler',
      '--declaration',
      '--emitDeclarationOnly',
      '--skipLibCheck',
      '--strict',
      '--noEmitOnError',
      '--rootDir',
      path.dirname(file),
      '--outDir',
      temporary,
      file,
    ],
    { cwd: root, stdio: 'inherit', windowsHide: true },
  );
  const declaration = await readFile(path.join(temporary, 'plugin-api.d.ts'), 'utf8');
  const index = await readFile(path.join(root, 'sdk/index.d.ts'));
  await mkdir(destination, { recursive: true });
  await writeFile(
    path.join(destination, 'extensions.d.ts'),
    '// Generated from Nexlet/src/shared/plugin-api.ts.\n' +
      declaration.replace(
        'export declare const SDK_PERMISSIONS:',
        'declare const SDK_PERMISSIONS:',
      ),
  );
  await writeFile(path.join(destination, 'index.d.ts'), index);
  console.log(`Synced public plugin types to ${destination}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
