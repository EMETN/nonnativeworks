import { expect, test } from 'vitest';
import { sortCountriesByName, type ReviewCountryGroup } from './admin-schemas';

function group(country_name: string): ReviewCountryGroup {
    return {
        country: country_name.toLowerCase(),
        country_name,
        country_code: country_name.slice(0, 2).toUpperCase(),
        jobs: [],
    };
}

test('orders country groups alphabetically by name', () => {
    const sorted = sortCountriesByName([
        group('Spain'),
        group('Czechia'),
        group('Lithuania'),
    ]);

    expect(sorted.map((g) => g.country_name)).toEqual([
        'Czechia',
        'Lithuania',
        'Spain',
    ]);
});
