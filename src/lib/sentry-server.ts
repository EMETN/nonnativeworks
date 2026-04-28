import * as Sentry from '@sentry/node';

Sentry.init({
    dsn: import.meta.env.SENTRY_DSN,
    sendDefaultPii: true,
    tracesSampleRate: 1.0,
    enabled: import.meta.env.PROD,
});
