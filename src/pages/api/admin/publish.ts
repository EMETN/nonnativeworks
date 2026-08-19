import type { APIRoute } from 'astro';
import { createSupabaseServiceClient } from '../../../lib/supabase';

export const prerender = false;

/** Long enough to absorb a double-click, short enough not to block a genuine follow-up publish. */
const RATE_LIMIT_SECONDS = 120;

function json(data: unknown, status: number) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export const GET: APIRoute = async () => {
    const supabase = createSupabaseServiceClient();

    const { data: lastPublish, error: lastPublishError } = await supabase
        .from('site_publishes')
        .select('triggered_at')
        .order('triggered_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (lastPublishError) {
        console.error(
            'publish GET (site_publishes):',
            lastPublishError.message,
        );
    }

    const [
        { data: newestCompany, error: companyError },
        { data: newestPosition, error: positionError },
    ] = await Promise.all([
        supabase
            .from('companies')
            .select('updated_at')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        supabase
            .from('positions')
            .select('extracted_at')
            .order('extracted_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);
    if (companyError) {
        console.error('publish GET (companies):', companyError.message);
    }
    if (positionError) {
        console.error('publish GET (positions):', positionError.message);
    }

    const buildTime = __BUILD_TIME__;
    const buildMs = Date.parse(buildTime);
    const newestData = [newestCompany?.updated_at, newestPosition?.extracted_at]
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1);

    return json(
        {
            buildTime,
            lastTriggeredAt: lastPublish?.triggered_at ?? null,
            // Derived rather than polled (no Netlify API token needed): a
            // trigger newer than the build time means a build is in flight.
            buildInFlight: Boolean(
                lastPublish?.triggered_at &&
                Date.parse(lastPublish.triggered_at) > buildMs,
            ),
            hasUnpublishedChanges: Boolean(
                newestData && Date.parse(newestData) > buildMs,
            ),
        },
        200,
    );
};

export const POST: APIRoute = async ({ locals, request }) => {
    const hookUrl = process.env.NETLIFY_BUILD_HOOK_URL;
    if (!hookUrl) {
        return json({ error: 'NETLIFY_BUILD_HOOK_URL is not configured' }, 503);
    }

    const supabase = createSupabaseServiceClient();

    const { data: lastPublish, error: lastPublishError } = await supabase
        .from('site_publishes')
        .select('triggered_at')
        .order('triggered_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (lastPublishError) {
        console.error(
            'publish POST (site_publishes):',
            lastPublishError.message,
        );
    }

    if (lastPublish?.triggered_at) {
        const elapsed =
            (Date.now() - Date.parse(lastPublish.triggered_at)) / 1000;
        if (elapsed < RATE_LIMIT_SECONDS) {
            return json(
                {
                    error: 'A publish was triggered moments ago',
                    retryAfterSeconds: Math.ceil(RATE_LIMIT_SECONDS - elapsed),
                },
                429,
            );
        }
    }

    // Middleware admits either an authenticated session or the scraper secret.
    const triggeredBy = request.headers.get('x-scraper-secret')
        ? 'scraper'
        : (locals.user?.email ?? 'unknown');

    let response: Response;
    try {
        response = await fetch(hookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                trigger_title: `publish by ${triggeredBy}`,
            }),
        });
    } catch (err) {
        console.error('publish POST (build hook fetch):', err);
        return json({ error: 'Failed to reach the Netlify build hook' }, 502);
    }

    if (!response.ok) {
        return json(
            { error: `Netlify build hook returned ${response.status}` },
            502,
        );
    }

    const { error: insertError } = await supabase
        .from('site_publishes')
        .insert({ triggered_by: triggeredBy });
    if (insertError) {
        console.error('publish POST (audit insert):', insertError.message);
    }

    return json({ ok: true, triggeredBy }, 200);
};
