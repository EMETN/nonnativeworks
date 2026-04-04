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
            sourcemaps: {
                disable: true,
            },
            telemetry: false,
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
