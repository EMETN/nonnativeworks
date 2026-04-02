import { useEffect } from 'preact/hooks';
import posthog from 'posthog-js';

export default function PostHogInit() {
    const isProd = process.env.NODE_ENV === 'production';

    useEffect(() => {
        const hasWindow = typeof window !== 'undefined';
        const posthogKey = import.meta.env.PUBLIC_POSTHOG_KEY;
        const enableInDev = false;
        if (!hasWindow || !posthogKey || (!isProd && !enableInDev)) {
            return;
        }

        const proxyApiHost = '/ph-events';
        const proxyUiHost = '/ph-static';

        const origin = hasWindow
            ? window.location.origin
            : import.meta.env.SITE;
        const apiHost = `${origin}${proxyApiHost}`;
        const uiHost = `${origin}${proxyUiHost}`;

        posthog.init(posthogKey, {
            api_host: apiHost,
            ui_host: uiHost,
            defaults: '2026-01-30',
            autocapture: true,
            capture_pageview: true,
            capture_pageleave: false,
            request_batching: true,
            advanced_disable_flags: true,
        });
    }, []);

    return null;
}
