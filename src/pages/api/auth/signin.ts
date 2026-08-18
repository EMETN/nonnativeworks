import type { APIRoute } from 'astro';
import { createSupabaseClient } from '../../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
    let body: { email?: string; password?: string };
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Invalid request body' }, 400);
    }

    const { email, password } = body;

    if (!email || !password) {
        return jsonResponse({ error: 'Email and password required' }, 400);
    }

    const supabase = createSupabaseClient(request, cookies);
    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        return jsonResponse({ error: 'Invalid email or password' }, 401);
    }

    return jsonResponse({ ok: true }, 200);
};

function jsonResponse(data: unknown, status: number) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
