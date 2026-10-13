import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ root: 'src/renderer', base: './', plugins: [react()], resolve: { conditions: ['onnxruntime-web-use-extern-wasm','module','browser','development|production'], alias: [{ find: /^onnxruntime-web$/, replacement: 'onnxruntime-web/wasm' }] }, build: { rollupOptions: { input: ['src/renderer/index.html','src/renderer/ocr.html'] }, outDir: '../../dist/renderer', emptyOutDir: true } });
