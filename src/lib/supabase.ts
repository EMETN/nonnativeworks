import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

// Server-only secrets use process.env (read at runtime, never inlined into build output).
// PUBLIC_* vars use import.meta.env (inlined by Vite at build time — safe for client exposure).
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
}

/**
 * Creates a Supabase client for use in Astro pages/API routes.
 * Accepts the request (for reading cookies) and cookies (for setting cookies).
 */
export function createSupabaseClient(request: Request, cookies: AstroCookies) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('Cookie') ?? '').map(({ name, value }) => ({
          name,
          value: value ?? '',
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}

/**
 * Creates a Supabase client with the service role key (bypasses RLS).
 * Use only in trusted server-side contexts (API routes for admin operations).
 */
export function createSupabaseServiceClient() {
  if (!supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  }
  return createServerClient(supabaseUrl, supabaseServiceKey, {
    cookies: {
      getAll() { return []; },
      setAll() {},
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
