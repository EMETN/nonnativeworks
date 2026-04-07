// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';
import sentry from '@sentry/astro';
import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
    output: 'server',
    adapter: netlify(),
    integrations: [
        preact(),
        sentry({
            sourceMapsUploadOptions: {
                org: process.env.SENTRY_ORG,
                project: process.env.SENTRY_PROJECT,
                authToken: process.env.SENTRY_AUTH_TOKEN,
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
