// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [preact()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      proxy: {
        '/ph-events': {
          target: 'https://eu.i.posthog.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ph-events/, ''),
        },
        '/ph-static': {
          target: 'https://eu-assets.i.posthog.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ph-static/, ''),
        },
      },
    },
  },
});
