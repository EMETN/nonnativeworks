import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

/**
 * Creates a Supabase client for use in Preact islands (browser).
 * Uses PUBLIC_ prefixed env vars so Astro exposes them to the client.
 */
export function createBrowserSupabaseClient() {
    return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
