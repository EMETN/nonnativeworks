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
        ['https://corporate.trustpilot.com/careers', 'trustpilot'],
        ['https://www.vml.com/careers', 'wundermanthompson'],
        ['https://www.anthropic.com/careers/jobs', 'anthropic'],
        ['https://www.cognite.com/en/company/careers', 'cognite'],
        ['https://www.ogilvy.com/work-with-us', 'ogilvy'],
    ])('%s → greenhouse board %j', (url, slug) => {
        expect(detectAts(url)).toEqual({
            ats: 'greenhouse',
            companySlug: slug,
        });
    });

    test('https://lovable.dev/careers → ashby board "lovable"', () => {
        expect(detectAts('https://lovable.dev/careers')).toEqual({
            ats: 'ashby',
            companySlug: 'lovable',
        });
    });

    test('https://legora.com/careers → ashby board "legora"', () => {
        expect(detectAts('https://legora.com/careers')).toEqual({
            ats: 'ashby',
            companySlug: 'legora',
        });
    });

    test('https://www.iceye.com/careers/positions → ashby board "iceye"', () => {
        expect(detectAts('https://www.iceye.com/careers/positions')).toEqual({
            ats: 'ashby',
            companySlug: 'iceye',
        });
    });

    test('https://tandemhealth.ai/about/careers → ashby board "tandem-health"', () => {
        expect(detectAts('https://tandemhealth.ai/about/careers')).toEqual({
            ats: 'ashby',
            companySlug: 'tandem-health',
        });
    });

    test('https://openai.com/careers/search/ → ashby board "openai"', () => {
        expect(detectAts('https://openai.com/careers/search/')).toEqual({
            ats: 'ashby',
            companySlug: 'openai',
        });
    });

    test('https://mistral.ai/careers/ → ashby board "mistral.ai"', () => {
        expect(detectAts('https://mistral.ai/careers/')).toEqual({
            ats: 'ashby',
            companySlug: 'mistral.ai',
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
            'https://jobs.eu.lever.co/seb',
            { ats: 'lever', companySlug: 'seb', leverEu: true },
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
            'https://jobs.ashbyhq.com/mistral.ai',
            { ats: 'ashby', companySlug: 'mistral.ai' },
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
        [
            'https://jobs.smartrecruiters.com/SAPITBusinessSysteme',
            { ats: 'smartrecruiters', companySlug: 'SAPITBusinessSysteme' },
        ],
        [
            'https://jobs.smartrecruiters.com/SAPITBusinessSysteme/744000153324379-hr-project-associate',
            { ats: 'smartrecruiters', companySlug: 'SAPITBusinessSysteme' },
        ],
        [
            'https://careers.smartrecruiters.com/SomeCo',
            { ats: 'smartrecruiters', companySlug: 'SomeCo' },
        ],
        [
            'https://api.smartrecruiters.com/v1/companies/SomeCo/postings',
            { ats: 'smartrecruiters', companySlug: 'SomeCo' },
        ],
    ])('%s → %o', (url, expected) => {
        expect(detectAts(url)).toEqual(expected);
    });
});
