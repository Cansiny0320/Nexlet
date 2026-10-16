import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({ root: 'src/renderer', base: './', plugins: [react(), tailwindcss()], resolve: { alias: [{ find: '@', replacement: fileURLToPath(new URL('./src/renderer', import.meta.url)) }] }, build: { rollupOptions: { input: ['src/renderer/index.html'] }, outDir: '../../dist/renderer', emptyOutDir: true } });
