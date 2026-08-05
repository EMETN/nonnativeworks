import { defineMiddleware } from 'astro:middleware';
import { createSupabaseClient } from './lib/supabase';

const PROTECTED_PREFIXES = ['/admin', '/api/admin'];

// Shared secret for machine-to-machine calls (e.g. GitHub Actions batch job).
// Set SCRAPER_SECRET in your environment. Requests bearing a matching
// X-Scraper-Secret header bypass both CSRF and session auth.
const SCRAPER_SECRET = process.env.SCRAPER_SECRET;

function hasValidScraperSecret(request: Request): boolean {
    if (!SCRAPER_SECRET) return false;
    return request.headers.get('x-scraper-secret') === SCRAPER_SECRET;
}

function isProtectedRoute(pathname: string): boolean {
    if (pathname === '/admin/login') return false;
    return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isStateChangingRequest(method: string): boolean {
    return (
        method === 'POST' ||
        method === 'PUT' ||
        method === 'PATCH' ||
        method === 'DELETE'
    );
}

function checkOrigin(request: Request): boolean {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (!origin || !host) return false;
    try {
        const originHost = new URL(origin).host;
        return originHost === host;
    } catch {
        return false;
    }
}

export const onRequest = defineMiddleware(async (context, next) => {
    const { pathname } = context.url;
    const { request } = context;

    // Machine-to-machine bypass: skip CSRF + auth for requests with the scraper secret.
    // Used by the GitHub Actions batch job (scraper/batch_run.py).
    if (isProtectedRoute(pathname) && hasValidScraperSecret(request)) {
        return next();
    }

    // CSRF: verify origin on state-changing requests to protected routes
    if (isProtectedRoute(pathname) && isStateChangingRequest(request.method)) {
        if (!checkOrigin(request)) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }

    // Auth: protect admin UI and admin API routes
    if (isProtectedRoute(pathname)) {
        const supabase = createSupabaseClient(request, context.cookies);
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            // API routes get 401, UI routes redirect to login
            if (pathname.startsWith('/api/')) {
                return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return context.redirect('/admin/login');
        }

        context.locals.user = user;
    }

    // Security headers
    const response = await next();
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // CDN caching for public GET pages. Data refreshes every ~2 days (scheduled scrape),
    // so a short fresh window plus long stale-while-revalidate gives near-instant repeat
    // navigation without serving stale data for long. Skipped when:
    //   - route is protected (admin UI/API) — user-specific, must never be shared-cached
    //   - method is not GET/HEAD — unsafe to cache
    //   - a Set-Cookie is present (e.g. Supabase refreshed an auth cookie) — would leak
    //   - handler already set its own Cache-Control (e.g. sitemap.xml)
    const isSafeMethod = request.method === 'GET' || request.method === 'HEAD';
    const alreadyCached = response.headers.has('Cache-Control');
    const hasSetCookie = response.headers.has('Set-Cookie');
    const isAdminArea =
        pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
    if (!isAdminArea && isSafeMethod && !alreadyCached && !hasSetCookie) {
        response.headers.set(
            'Cache-Control',
            'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
        );
    }

    return response;
});
