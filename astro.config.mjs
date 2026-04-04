// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import node from '@astrojs/node';
import netlify from '@astrojs/netlify';
import tailwindcss from '@tailwindcss/vite';
import sentry from '@sentry/astro';

const isNetlify = !!process.env.NETLIFY;

// https://astro.build/config
export default defineConfig({
    output: 'server',
    adapter: isNetlify ? netlify() : node({ mode: 'standalone' }),
    integrations: [
        preact(),
        sentry({
            sourceMapsUploadOptions: {
                org: import.meta.env.SENTRY_ORG,
                project: import.meta.env.SENTRY_PROJECT,
                authToken: import.meta.env.SENTRY_AUTH_TOKEN,
            },
        }),
    ],
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
