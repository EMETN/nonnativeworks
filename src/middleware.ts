import { defineMiddleware } from 'astro:middleware';
import { createSupabaseClient } from './lib/supabase';

const PROTECTED_PREFIXES = ['/admin', '/api/admin'];

function isProtectedRoute(pathname: string): boolean {
  if (pathname === '/admin/login') return false;
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isStateChangingRequest(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
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
    const { data: { user } } = await supabase.auth.getUser();

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
  return response;
});
