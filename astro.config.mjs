// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import node from '@astrojs/node';
import netlify from '@astrojs/netlify';
import tailwindcss from '@tailwindcss/vite';
const isNetlify = !!process.env.NETLIFY;

// https://astro.build/config
export default defineConfig({
    output: 'server',
    adapter: isNetlify ? netlify() : node({ mode: 'standalone' }),
    integrations: [preact()],
    vite: {
        plugins: [
            tailwindcss(),
            // Force terser minification for client builds to avoid esbuild
            // platform-specific issue on Netlify (Syntax error "d")
            {
                name: 'force-terser-minify',
                config(config) {
                    return {
                        environments: {
                            client: {
                                build: { minify: 'terser' },
                            },
                        },
                    };
                },
            },
        ],
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
