// Astro dev caches getStaticPaths until a source file changes, so new rows 404 until
// a restart. Its internal 'astro:content-changed' event clears that cache.
export function liveStaticPathsInDev() {
    return {
        name: 'live-static-paths-in-dev',
        apply: /** @type {const} */ ('serve'),
        /** @param {import('vite').ViteDevServer} server */
        configureServer(server) {
            server.middlewares.use((_req, _res, next) => {
                for (const name of ['ssr', 'prerender']) {
                    server.environments[name]?.hot.send(
                        'astro:content-changed',
                        {},
                    );
                }
                next();
            });
        },
    };
}
