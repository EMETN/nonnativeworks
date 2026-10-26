/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// getViteConfig compiles .astro files, so the Container API can render pages in tests.
export default getViteConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
        hookTimeout: 60_000,
    },
});
