import { defineConfig } from 'vite-plus';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [{ find: '@', replacement: fileURLToPath(new URL('./src/renderer', import.meta.url)) }],
  },
  build: {
    rolldownOptions: { input: ['src/renderer/index.html'] },
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['tests/**/*.test.ts'],
    maxWorkers: 2,
  },
  lint: {
    ignorePatterns: [
      'website/**',
      'dist/**',
      'release/**',
      '.tmp/**',
      'assets/vendor/**',
      'node_modules/**',
    ],
    categories: { correctness: 'off' },
    plugins: ['import'],
    rules: { 'import/no-duplicates': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    ignorePatterns: [
      'website/**',
      'dist/**',
      'release/**',
      '.tmp/**',
      'assets/vendor/**',
      'node_modules/**',
      'pnpm-lock.yaml',
      'docs/**',
    ],
    singleQuote: true,
  },
});
