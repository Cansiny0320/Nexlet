import { build as bundle } from 'esbuild';
import { build as vite } from 'vite';
import { copyFile, mkdir, rm } from 'node:fs/promises';
await bundle({ entryPoints: ['src/main/index.ts'], bundle: true, packages: 'external', platform: 'node', format: 'cjs', outfile: 'dist/main/index.cjs', sourcemap: true });
await bundle({ entryPoints: ['src/main/panel-native-worker.ts'], bundle: true, packages: 'external', platform: 'node', format: 'cjs', outfile: 'dist/main/panel-native-worker.cjs', sourcemap: true });
await copyFile('src/main/match-worker.cjs','dist/main/match-worker.cjs');
await bundle({ entryPoints: ['src/main/plugin-sdk/backend-worker.ts'], bundle: true, packages: 'external', platform: 'node', format: 'cjs', outfile: 'dist/main/plugin-backend-worker.cjs', sourcemap: true });
await bundle({ entryPoints: ['src/main/plugin-sdk/image-worker.ts'], bundle: true, packages: 'external', platform: 'node', format: 'cjs', outfile: 'dist/main/plugin-image-worker.cjs', sourcemap: true });
await bundle({ entryPoints: ['src/preload/host.ts', 'src/preload/plugin.ts', 'src/preload/desktop-tools.ts', 'src/preload/ocr.ts'], bundle: true, external: ['electron'], platform: 'node', format: 'cjs', outdir: 'dist/preload', outExtension: { '.js': '.cjs' } });
await import('./verify-ocr-assets.mjs');
await vite();

await mkdir('dist/renderer/runtime',{recursive:true});
for(const extension of ['mjs','wasm'])await copyFile('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.'+extension,'dist/renderer/runtime/ort-wasm-simd-threaded.'+extension);
for(const file of ['ocr-worker.cjs','ocr-worker.cjs.map','ocr-engine.cjs'])await rm('dist/main/'+file,{force:true});
