import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';
import type { Database } from './database.types';

export type TypedSupabaseClient = ReturnType<
    typeof createSupabaseServiceClient
>;

// Server-only secrets use process.env (read at runtime, never inlined into build output).
// PUBLIC_* vars use import.meta.env (inlined by Vite at build time — safe for client exposure).
//
// These are read lazily rather than at module load: once public pages prerender,
// this module is imported during the build, and a module-level throw would fire
// before Astro could report which page or query triggered it.
function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing ${name} environment variable`);
    }
    return value;
}

/**
 * Creates a Supabase client for use in Astro pages/API routes.
 * Accepts the request (for reading cookies) and cookies (for setting cookies).
 */
export function createSupabaseClient(request: Request, cookies: AstroCookies) {
    return createServerClient<Database>(
        requireEnv('SUPABASE_URL'),
        requireEnv('SUPABASE_ANON_KEY'),
        {
            cookies: {
                getAll() {
                    return parseCookieHeader(
                        request.headers.get('Cookie') ?? '',
                    ).map(({ name, value }) => ({
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
        },
    );
}

/**
 * Creates a Supabase client with the service role key (bypasses RLS).
 * Use only in trusted server-side contexts (API routes for admin operations).
 */
export function createSupabaseServiceClient() {
    return createServerClient<Database>(
        requireEnv('SUPABASE_URL'),
        requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
        {
            cookies: {
                getAll() {
                    return [];
                },
                setAll() {},
            },
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        },
    );
}

let publicClient: ReturnType<typeof createSupabaseServiceClient> | null = null;

/**
 * Anon-key client for build-time reads (getStaticPaths). Holds no cookies and
 * refreshes no session, so it is safe to share across a whole build.
 *
 * Memoised rather than module-level: constructing at import time would read env
 * vars before the build environment is ready.
 */
export function createPublicClient() {
    if (!publicClient) {
        publicClient = createServerClient<Database>(
            requireEnv('SUPABASE_URL'),
            requireEnv('SUPABASE_ANON_KEY'),
            {
                cookies: {
                    getAll() {
                        return [];
                    },
                    setAll() {},
                },
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            },
        );
    }
    return publicClient;
}
