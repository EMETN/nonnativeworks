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

// The Thoughtworks override must not perturb the standard hostname patterns every
// other tracked company relies on.
describe('detectAts — other ATS hostnames still detect correctly', () => {
    test.each([
        [
            'https://boards.greenhouse.io/oura',
            { ats: 'greenhouse', companySlug: 'oura' },
        ],
        [
            'https://job-boards.greenhouse.io/smartlyio',
            { ats: 'greenhouse', companySlug: 'smartlyio' },
        ],
        [
            'https://jobs.eu.lever.co/prosus',
            { ats: 'lever', companySlug: 'prosus', leverEu: true },
        ],
        [
            'https://jobs.lever.co/someco',
            { ats: 'lever', companySlug: 'someco', leverEu: false },
        ],
        [
            'https://jobs.ashbyhq.com/notion/abc-123',
            { ats: 'ashby', companySlug: 'notion' },
        ],
        [
            'https://kone.wd3.myworkdayjobs.com/en-US/Careers',
            { ats: 'workday', companySlug: 'kone' },
        ],
        [
            'https://apply.workable.com/someco/',
            { ats: 'workable', companySlug: 'someco' },
        ],
        [
            'https://happeo.recruitee.com',
            { ats: 'recruitee', companySlug: 'happeo' },
        ],
    ])('%s → %o', (url, expected) => {
        expect(detectAts(url)).toEqual(expected);
    });
});
