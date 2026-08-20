import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { createSupabaseServiceClient } from '../../../lib/supabase';
import { mapDeployNotification } from '../../../lib/publish-status';

export const prerender = false;

function tokenValid(provided: string): boolean {
    const secret = process.env.NETLIFY_DEPLOY_HOOK_SECRET;
    if (!secret) return false;
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(secret, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

export const POST: APIRoute = async ({ request, url }) => {
    if (!tokenValid(url.searchParams.get('token') ?? '')) {
        return new Response('Unauthorized', { status: 401 });
    }

    let payload: { id?: string; state?: string; context?: string };
    try {
        payload = await request.json();
    } catch {
        return new Response('Bad Request', { status: 400 });
    }

    const row = mapDeployNotification(payload);
    if (!row) return new Response('Ignored', { status: 200 });

    const supabase = createSupabaseServiceClient();
    const { error } = await supabase
        .from('site_builds')
        .upsert(row, { onConflict: 'deploy_id' });
    if (error) {
        console.error('netlify deploy webhook:', error.message);
        return new Response('Error', { status: 500 });
    }

    return new Response('OK', { status: 200 });
};
