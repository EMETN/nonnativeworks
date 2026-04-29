import * as Sentry from '@sentry/browser';

Sentry.init({
    dsn: import.meta.env.PUBLIC_SENTRY_DSN,
    sendDefaultPii: true,
    tracesSampleRate: 1.0,
    tunnel: '/api/sentry-tunnel',
    enabled: import.meta.env.PROD,
    ignoreErrors: [
        /window\.__firefox__/,
        /__firefox__/,
        /window\.ethereum/,
        /DarkReader/,
        /^ResizeObserver loop/,
        /Non-Error promise rejection captured/,
    ],
    denyUrls: [
        /^chrome-extension:\/\//,
        /^moz-extension:\/\//,
        /^safari-extension:\/\//,
        /^safari-web-extension:\/\//,
    ],
});
