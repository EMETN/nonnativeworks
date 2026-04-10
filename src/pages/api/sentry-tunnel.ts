import type { APIRoute } from 'astro';

function parseDsn(dsn: string) {
    const url = new URL(dsn);
    return {
        host: url.hostname,
        projectId: url.pathname.replace('/', ''),
    };
}

export const POST: APIRoute = async ({ request }) => {
    const sentryDsn = import.meta.env.SENTRY_DSN;
    if (!sentryDsn) {
        return new Response('Sentry not configured', { status: 500 });
    }

    const { host, projectId } = parseDsn(sentryDsn);

    const body = await request.text();
    const [header] = body.split('\n');
    const dsn = JSON.parse(header).dsn as string;

    if (!dsn.includes(host) || !dsn.includes(projectId)) {
        return new Response('Invalid DSN', { status: 400 });
    }

    const url = `https://${host}/api/${projectId}/envelope/`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-sentry-envelope' },
        body,
    });

    return new Response(response.body, { status: response.status });
};
