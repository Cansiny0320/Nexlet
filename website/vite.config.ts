import { fileURLToPath } from 'node:url';
import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';
  const { cloudflare } = await import('@cloudflare/vite-plugin');
  return {
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    css: { postcss: { plugins: [tailwindcss()] } },
    plugins: [
      sites(),
      cloudflare({
        viteEnvironment: { name: 'ssr' },
        config: {
          name: 'nexlet-website',
          main: './src/server.ts',
          compatibility_date: '2026-05-15',
          compatibility_flags: ['nodejs_compat'],
        },
      }),
      tanstackStart(),
      react(),
    ],
    lint: {
      ignorePatterns: [
        'node_modules/**',
        'dist/**',
        '.wrangler/**',
        '.qa/**',
        'src/routeTree.gen.ts',
        'docs/**',
        'designs/**',
      ],
      plugins: ['typescript', 'react', 'jsx-a11y'],
    },
    fmt: {
      singleQuote: true,
      semi: true,
      printWidth: 100,
      ignorePatterns: [
        'node_modules/**',
        'dist/**',
        '.wrangler/**',
        '.qa/**',
        'src/routeTree.gen.ts',
        'docs/**',
        'designs/**',
        'public/**',
        'src/vendor/**',
        'pnpm-lock.yaml',
      ],
    },
  };
});
