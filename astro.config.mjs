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
    // Required for correct canonical/OG/JSON-LD URLs once pages are built ahead of
    // a request — without it, Astro.url resolves to localhost in production HTML.
    site: 'https://nonnativeworks.com',

    // Pin the existing URL shape. Astro's static default (build.format 'directory')
    // would serve /countries as /countries/, 301-ing every indexed URL on the site.
    trailingSlash: 'never',
    build: {
        format: 'file',
    },
    // Static by default, with prerender = false opting /admin and /api back into
    // on-demand rendering. The default is inverted deliberately: a public page that
    // forgets the directive becomes static (loud, cheap) rather than SSR (a silent,
    // recurring function invocation and database round trip on every cache miss).
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
            // Stamped at build time so the admin can tell how old the live site is,
            // and whether a triggered build has landed yet.
            __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
        },
    },
});
