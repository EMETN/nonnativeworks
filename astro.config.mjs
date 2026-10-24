// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import netlify from '@astrojs/netlify';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import sentry from '@sentry/astro';
import { liveStaticPathsInDev } from './scripts/live-static-paths-in-dev.mjs';

const adapter = process.env.NETLIFY ? netlify() : node({ mode: 'standalone' });

export default defineConfig({
    // Without a site, Astro.url resolves to localhost in the built HTML (canonical/OG/JSON-LD).
    site: 'https://nonnativeworks.com',

    // The static default (format 'directory') would 301 /countries to /countries/.
    trailingSlash: 'never',
    build: {
        format: 'file',
    },
    redirects: {
        '/czech-republic': '/czechia',
    },
    // Static by default; prerender = false opts /admin and /api into on-demand rendering.
    output: 'static',
    // Astro hashes inline scripts, so script-src needs no 'unsafe-inline';
    // style-src-attr covers the dynamic inline styles (gauges) that can't be
    // hashed, and connect-src 'self' holds since PostHog/Sentry are proxied.
    security: {
        csp: {
            directives: [
                "default-src 'self'",
                "img-src 'self' data:",
                "font-src 'self'",
                "connect-src 'self'",
                "object-src 'none'",
                "base-uri 'self'",
                "form-action 'self'",
            ],
            styleDirective: {
                resources: [{ resource: "'unsafe-inline'", kind: 'attribute' }],
            },
        },
    },
    adapter,
    prefetch: {
        defaultStrategy: 'hover',
    },
    integrations: [
        preact(),
        sentry({
            clientInitPath: 'src/lib/sentry-client.ts',
            serverInitPath: 'src/lib/sentry-server.ts',
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
        }),
    ],
    vite: {
        plugins: [tailwindcss(), liveStaticPathsInDev()],
        optimizeDeps: {
            // A dep found after startup makes Vite re-optimize mid-session, breaking in-flight islands.
            include: [
                'posthog-js/dist/module.no-external',
                '@sentry/browser',
                'zod',
                'astro/virtual-modules/transitions-events.js',
                'astro/virtual-modules/transitions-router.js',
                'astro/virtual-modules/transitions-swap-functions.js',
                'astro/virtual-modules/transitions-types.js',
            ],
        },
        define: {
            // Stamped at build time so admin can tell how old the live site is.
            __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
        },
    },
});
