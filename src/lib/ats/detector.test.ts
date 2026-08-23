// Run once:  pnpm test
// Watch mode: pnpm test:watch

import { test, expect, describe } from 'vitest';
import { detectAts } from './detector';

describe('detectAts — hostname slug overrides', () => {
    // The www. prefix must be stripped for the override to match
    // (Thoughtworks links as www.thoughtworks.com, keyed as thoughtworks.com).
    test.each([
        ['https://www.thoughtworks.com/careers/jobs', 'thoughtworks'],
        ['https://ouraring.com/careers', 'oura'],
        ['https://alpha-sense.com/careers/', 'alphasense'],
        ['https://deptagency.com/en-us/careers', 'dept'],
    ])('%s → greenhouse board %j', (url, slug) => {
        expect(detectAts(url)).toEqual({
            ats: 'greenhouse',
            companySlug: slug,
        });
    });
});
