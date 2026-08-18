/**
 * Returns a URL's pathname with the physical output-file suffix stripped.
 *
 * Under `build.format: 'file'`, Astro.url carries the built file path during
 * static generation (e.g. `/countries.html`, `/index.html`), not the URL the
 * page is served at. Strip `index.html`/`.html` so URL-derived values (canonical,
 * report links, active-nav matching) match the served path. A no-op under
 * SSR/dev, where the pathname is already clean.
 */
export function cleanPathname(url: URL): string {
    return url.pathname.replace(/index\.html$/, '').replace(/\.html$/, '');
}
