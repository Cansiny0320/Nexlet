import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({ root: 'src/renderer', base: './', plugins: [react(), tailwindcss()], resolve: { conditions: ['onnxruntime-web-use-extern-wasm','module','browser','development|production'], alias: [{ find: '@', replacement: fileURLToPath(new URL('./src/renderer', import.meta.url)) }, { find: /^onnxruntime-web$/, replacement: 'onnxruntime-web/wasm' }] }, build: { rollupOptions: { input: ['src/renderer/index.html','src/renderer/ocr.html'] }, outDir: '../../dist/renderer', emptyOutDir: true } });
