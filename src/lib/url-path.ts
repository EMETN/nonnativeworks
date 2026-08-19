/**
 * Under `build.format: 'file'`, Astro.url carries the built `.html` path, not the served URL.
 * Strip it so URL-derived values match; a no-op under SSR/dev.
 */
export function cleanPathname(url: URL): string {
    return url.pathname.replace(/index\.html$/, '').replace(/\.html$/, '');
}
