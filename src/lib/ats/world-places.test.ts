import { test, expect } from 'vitest';
import {
    expandCountryGroup,
    lookupStateCode,
    lookupWorldPlace,
    OUTSIDE_EUROPE,
} from './world-places';

test.each([
    ['Austin', 'US'],
    ['Texas', 'US'],
    ['Ontario', 'CA'],
    ['Bengaluru', 'IN'],
    ['Sao Paulo', 'BR'],
    ['São Paulo', 'BR'],
    ['Tel Aviv', 'IL'],
    ['APAC', 'XX'],
])('%s is a world place in %s', (segment, code) => {
    expect(lookupWorldPlace(segment)?.code).toBe(code);
});

test('Berlin is not a world place', () => {
    expect(lookupWorldPlace('Berlin')).toBeUndefined();
});

test('the outside-Europe marker is XX', () => {
    expect(OUTSIDE_EUROPE.code).toBe('XX');
});

test.each([
    ['TX', 'US'],
    ['ON', 'CA'],
    ['DE', undefined],
    ['IS', undefined],
])('state code %s resolves to %s', (code, expected) => {
    expect(lookupStateCode(code)?.code).toBe(expected);
});

test.each([
    ['Nordics', ['SE', 'NO', 'DK', 'FI', 'IS']],
    ['Nordic Countries', ['SE', 'NO', 'DK', 'FI', 'IS']],
    ['DACH', ['DE', 'AT', 'CH']],
    ['Benelux', ['BE', 'NL', 'LU']],
    ['Baltic States', ['EE', 'LV', 'LT']],
    ['Germany', []],
])('%s expands to %j', (segment, expected) => {
    expect(expandCountryGroup(segment).map((c) => c.code)).toEqual(expected);
});
