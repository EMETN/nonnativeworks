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
    // Without a site, Astro.url resolves to localhost in the built HTML (canonical/OG/JSON-LD).
    site: 'https://nonnativeworks.com',

    // Pin the existing URL shape — the static default (build.format
    // 'directory') would 301 /countries to /countries/.
    trailingSlash: 'never',
    build: {
        format: 'file',
    },
    // Static by default; prerender = false opts /admin and /api into on-demand rendering.
    output: 'static',
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
            // ClientRouter (astro:transitions) is only used by AdminLayout.astro, not any
            // public page. Vite's dependency crawl runs from the pages it's actually seen,
            // so on a fresh cache these virtual modules are undiscovered until the first
            // admin page loads — triggering a disruptive mid-session re-optimization that
            // can leave an in-flight page's module graph broken (dynamic import errors,
            // islands stuck mid-hydration). Listing them here pre-bundles them at startup
            // instead.
            include: [
                'posthog-js/dist/module.full.no-external',
                'astro/virtual-modules/transitions-events.js',
                'astro/virtual-modules/transitions-router.js',
                'astro/virtual-modules/transitions-swap-functions.js',
                'astro/virtual-modules/transitions-types.js',
            ],
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
        define: {
            // Stamped at build time so admin can tell how old the live site is.
            __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
        },
    },
});
