// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import netlify from '@astrojs/netlify';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import sentry from '@sentry/astro';

// Use the Netlify adapter when building on Netlify (NETLIFY env var is set automatically).
// Fall back to the Node standalone adapter for local dev and GitHub Actions CI.
const adapter = process.env.NETLIFY ? netlify() : node({ mode: 'standalone' });

// https://astro.build/config
export default defineConfig({
    output: 'server',
    adapter,
    prefetch: {
        defaultStrategy: 'hover',
    },
    integrations: [
        preact(),
        sentry({
            clientInitPath: 'src/lib/sentry-client.ts',
            serverInitPath: 'src/lib/sentry-server.ts',
            sourceMapsUploadOptions: {
                org: process.env.SENTRY_ORG,
                project: process.env.SENTRY_PROJECT,
                authToken: process.env.SENTRY_AUTH_TOKEN,
            },
        }),
    ],
    vite: {
        plugins: [tailwindcss()],
        optimizeDeps: {
            include: ['posthog-js/dist/module.full.no-external'],
        },
        server: {
            proxy: {
                '/t': {
                    target: 'https://eu.i.posthog.com',
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/t/, ''),
                },
            },
        },
    },
});
