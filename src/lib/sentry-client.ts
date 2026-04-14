import * as Sentry from '@sentry/browser';

Sentry.init({
    dsn: import.meta.env.PUBLIC_SENTRY_DSN,
    sendDefaultPii: true,
    tracesSampleRate: 1.0,
    tunnel: '/api/sentry-tunnel',
    ignoreErrors: [
        // Firefox for iOS injects these into every page.
        /window\.__firefox__/,
        /__firefox__/,
        // Crypto wallet extensions (MetaMask etc.) inject window.ethereum.
        /window\.ethereum/,
        // Dark Reader extension.
        /DarkReader/,
        // Generic browser / extension noise.
        /^ResizeObserver loop/,
        /Non-Error promise rejection captured/,
    ],
    denyUrls: [
        // Browser extension protocols.
        /^chrome-extension:\/\//,
        /^moz-extension:\/\//,
        /^safari-extension:\/\//,
        /^safari-web-extension:\/\//,
    ],
});
