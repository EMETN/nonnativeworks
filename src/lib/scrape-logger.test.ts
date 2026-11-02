import { afterEach, expect, test, vi } from 'vitest';
import { logScrapeRun } from './scrape-logger';

vi.mock('fs', async (original) => ({
    ...(await original<typeof import('fs')>()),
    appendFileSync: vi.fn(),
    mkdirSync: vi.fn(),
}));

afterEach(() => {
    vi.restoreAllMocks();
});

function loggedText(unknownCities?: string[]): string {
    const stderr = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
    logScrapeRun({
        companyName: 'Acme',
        careerUrl: 'https://acme.test',
        ats: null,
        positions: [],
        skippedUnknownLocation: 0,
        skippedUntrackedCountry: 0,
        unknownCities,
        alsoToStderr: true,
    });
    return stderr.mock.calls.map(([text]) => String(text)).join('');
}

test('lists cities the lookup does not recognise', () => {
    expect(loggedText(['Nowhereville', 'Elsewhere'])).toContain(
        'UNKNOWN CITIES  Nowhereville  ·  Elsewhere',
    );
});

test('leaves the line out when every city is recognised', () => {
    expect(loggedText([])).not.toContain('UNKNOWN CITIES');
});
