import { build as bundle } from 'esbuild';
import { build as vite } from 'vite';
import { copyFile } from 'node:fs/promises';
await bundle({ entryPoints: ['src/main/index.ts'], bundle: true, packages: 'external', platform: 'node', format: 'cjs', outfile: 'dist/main/index.cjs', sourcemap: true });
await copyFile('src/main/match-worker.cjs','dist/main/match-worker.cjs');
await bundle({ entryPoints: ['src/preload/host.ts', 'src/preload/plugin.ts'], bundle: true, external: ['electron'], platform: 'node', format: 'cjs', outdir: 'dist/preload', outExtension: { '.js': '.cjs' } });
await vite();
