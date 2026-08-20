import type { APIRoute } from 'astro';
import { createSupabaseServiceClient } from '../../../lib/supabase';
import {
    summariseChanges,
    deriveBuildInFlight,
} from '../../../lib/publish-status';

export const prerender = false;

/** Long enough to absorb a double-click, short enough not to block a genuine follow-up publish. */
const RATE_LIMIT_SECONDS = 120;

/** A 'building' row older than this is treated as stale (missed completion webhook). */
const BUILD_STALE_MINUTES = 25;

function json(data: unknown, status: number) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export const GET: APIRoute = async () => {
    const supabase = createSupabaseServiceClient();
    const buildTime = __BUILD_TIME__;

    const [summaryRes, buildsRes, lastPublishRes, lastDeployRes] =
        await Promise.all([
            supabase.rpc('admin_change_summary', { since: buildTime }),
            supabase
                .from('site_builds')
                .select('state, started_at, created_at')
                .order('created_at', { ascending: false })
                .limit(5),
            supabase
                .from('site_publishes')
                .select('triggered_at')
                .order('triggered_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
            // Last successful deploy from Netlify's webhook — any trigger, and the
            // same value in dev and prod (both read the shared database).
            supabase
                .from('site_builds')
                .select('finished_at')
                .eq('state', 'ready')
                .order('finished_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
        ]);

    if (summaryRes.error)
        console.error('publish GET (summary):', summaryRes.error.message);
    if (buildsRes.error)
        console.error('publish GET (site_builds):', buildsRes.error.message);
    if (lastPublishRes.error)
        console.error(
            'publish GET (site_publishes):',
            lastPublishRes.error.message,
        );
    if (lastDeployRes.error)
        console.error(
            'publish GET (last deploy):',
            lastDeployRes.error.message,
        );

    const { changeCount, changes } = summariseChanges(
        (summaryRes.data ?? []).map((r) => ({
            entity_type: r.entity_type,
            action: r.action,
            count: Number(r.count),
        })),
    );

    const buildInFlight = deriveBuildInFlight(
        buildsRes.data ?? [],
        Date.now(),
        BUILD_STALE_MINUTES,
    );

    return json(
        {
            buildTime,
            lastTriggeredAt: lastPublishRes.data?.triggered_at ?? null,
            lastDeployedAt: lastDeployRes.data?.finished_at ?? null,
            buildInFlight,
            hasUnpublishedChanges: changeCount > 0,
            changeCount,
            changes,
        },
        200,
    );
};

export const POST: APIRoute = async ({ locals, request }) => {
    // Hard block: never let a local dev server trigger a production deploy, even
    // if a build-hook URL is present in the environment. DEV is true only under
    // `astro dev`; the built server used in CI and on Netlify has it false.
    if (import.meta.env.DEV) {
        return json(
            { error: 'Publishing is disabled in local development' },
            403,
        );
    }

    const hookUrl = process.env.NETLIFY_BUILD_HOOK_URL;
    if (!hookUrl) {
        return json({ error: 'NETLIFY_BUILD_HOOK_URL is not configured' }, 503);
    }

    const supabase = createSupabaseServiceClient();

    const { data: recentBuilds } = await supabase
        .from('site_builds')
        .select('state, started_at, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    if (
        deriveBuildInFlight(recentBuilds ?? [], Date.now(), BUILD_STALE_MINUTES)
    ) {
        return json({ error: 'A build is already in progress' }, 409);
    }

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
