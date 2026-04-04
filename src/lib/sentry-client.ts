import * as Sentry from '@sentry/browser';

Sentry.init({
    dsn: import.meta.env.PUBLIC_SENTRY_DSN,
    sendDefaultPii: true,
    tracesSampleRate: 1.0,
    tunnel: '/api/sentry-tunnel',
});
