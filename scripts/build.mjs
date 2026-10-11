import { build as bundle } from 'esbuild';
import { build as vite } from 'vite';
await bundle({ entryPoints: ['src/main/index.ts'], bundle: true, packages: 'external', platform: 'node', format: 'cjs', outfile: 'dist/main/index.cjs', sourcemap: true });
await bundle({ entryPoints: ['src/preload/host.ts', 'src/preload/plugin.ts'], bundle: true, external: ['electron'], platform: 'node', format: 'cjs', outdir: 'dist/preload', outExtension: { '.js': '.cjs' } });
await vite();
