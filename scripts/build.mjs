import { build as pack } from 'vite-plus/pack';
import { build as vite } from 'vite-plus';
import { copyFile, rm } from 'node:fs/promises';

for (const directory of ['dist/main', 'dist/preload'])
  await rm(directory, { recursive: true, force: true });
const common = {
  config: false,
  format: 'cjs',
  platform: 'node',
  target: 'node24',
  dts: false,
  clean: false,
  sourcemap: true,
  outExtensions: () => ({ js: '.cjs' }),
};
await pack({
  ...common,
  entry: {
    index: 'src/main/index.ts',
    'panel-native-worker': 'src/main/panel-native-worker.ts',
    'plugin-backend-worker': 'src/main/plugin-sdk/backend-worker.ts',
    'plugin-image-worker': 'src/main/plugin-sdk/image-worker.ts',
  },
  outDir: 'dist/main',
  deps: { neverBundle: true, alwaysBundle: [/^@orpc\//] },
});
await copyFile('src/main/match-worker.cjs', 'dist/main/match-worker.cjs');
// Sandboxed preloads cannot load sibling chunks or npm packages.
for (const name of ['host', 'plugin', 'desktop-tools']) {
  await pack({
    ...common,
    entry: { [name]: 'src/preload/' + name + '.ts' },
    outDir: 'dist/preload',
    sourcemap: false,
    deps: { neverBundle: ['electron'], alwaysBundle: [/.*/] },
  });
}
await vite();
