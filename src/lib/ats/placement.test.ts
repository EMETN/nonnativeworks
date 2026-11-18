import { test, expect } from 'vitest';
import type { CountryInfo } from './country-lookup';
import type { RawJob } from './types';
import {
    isLocationPlacedInTrackedCountry,
    isPlacedInTrackedCountry,
    placeJob,
    placeRawJob,
    type WorkModel,
} from './placement';

const at = (loc: string, ats?: WorkModel, fb: CountryInfo | null = null) => {
    const p = placeJob(loc, ats, fb);
    return {
        codes: p.countries.map((c) => c.code).sort(),
        model: p.workModel,
        flag: p.unplacedLocation,
    };
};

test('placeless remote goes to Europe unflagged', () => {
    for (const loc of [
        'Remote',
        'Fully Remote',
        'Worldwide',
        'Anywhere',
        'WFH',
    ]) {
        expect(at(loc)).toEqual({
            codes: ['EU'],
            model: 'remote',
            flag: undefined,
        });
    }
});
test('every placeless label goes to Europe unflagged', () => {
    for (const loc of [
        'Global',
        'Work from home',
        'Home Office',
        '  fully remote  ',
    ]) {
        expect(at(loc)).toEqual({
            codes: ['EU'],
            model: 'remote',
            flag: undefined,
        });
    }
});
test('placeless text behind a remote marker goes to Europe unflagged', () => {
    for (const loc of [
        'Remote - Worldwide',
        'Remote - Global',
        'Worldwide (Remote)',
    ]) {
        expect(at(loc)).toEqual({
            codes: ['EU'],
            model: 'remote',
            flag: undefined,
        });
    }
});
test('ordinary words are not timezones', () => {
    expect(at('Remote - West')).toEqual({
        codes: ['EU'],
        model: 'remote',
        flag: 'Remote - West',
    });
    expect(at('Hartford, CT').codes).toEqual(['US']);
    expect(at('Stamford, CT').codes).toEqual(['US']);
});
test('PT is Pacific time only alone in parentheses beside a remote marker', () => {
    expect(at('Remote (PT)').codes).toEqual(['XX']);
    expect(at('Remote (MT)').codes).toEqual(['XX']);
    expect(at('Lisbon, PT').codes).toEqual(['PT']);
    expect(at('PT').codes).toEqual(['PT']);
    expect(at('Valletta, MT').codes).toEqual(['MT']);
});
test('ATS remote with empty location goes to Europe', () => {
    expect(at('', 'remote')).toEqual({
        codes: ['EU'],
        model: 'remote',
        flag: undefined,
    });
});
test('empty location without a work model is skipped', () => {
    expect(at('').codes).toEqual([]);
});
test('Europe regions and European timezones are remote Europe', () => {
    for (const loc of [
        'Eastern Europe',
        'EMEA',
        'Remote (CET)',
        'Remote, UTC+1 to UTC+3',
        'EU Remote',
    ]) {
        expect(at(loc)).toMatchObject({ codes: ['EU'], model: 'remote' });
    }
});
test('more Europe regions and timezones are remote Europe', () => {
    for (const loc of [
        'Central Europe',
        'Western Europe',
        'Northern Europe',
        'Southern Europe',
        'Europe, Middle East & Africa',
        'Remote (GMT+2)',
        'Remote (UTC+01:00)',
        'Remote - CEST',
        'Remote (EET/EEST)',
        'Remote - UTC-5 to UTC+1',
    ]) {
        expect(at(loc)).toEqual({
            codes: ['EU'],
            model: 'remote',
            flag: undefined,
        });
    }
});
test('non-European timezone is outside Europe', () => {
    expect(at('Remote (EST)').codes).toEqual(['XX']);
});
test('more non-European timezones are outside Europe', () => {
    for (const loc of [
        'Remote (PST)',
        'Remote (GMT-5)',
        'Remote, UTC+5:30',
        'Remote (UTC+4 to UTC+8)',
        'Remote (JST)',
        'Remote (ET)',
    ]) {
        expect(at(loc).codes).toEqual(['XX']);
    }
});
test('a country code that is also a timezone stays the country', () => {
    expect(at('Lisbon, PT').codes).toEqual(['PT']);
    expect(at('Tallinn, EST').codes).toEqual(['EE']);
});
test('untracked country plus Europe goes to Europe', () => {
    expect(at('United States; Europe').codes).toEqual(['EU']);
    expect(at('Remote (EST/CET)').codes).toEqual(['EU']);
    expect(at('Remote - US or EU').codes).toEqual(['EU']);
});
test('tracked country plus Europe stays in the country', () => {
    expect(at('Remote - Poland, Europe').codes).toEqual(['PL']);
});
test('company fallback wins over Europe for placeless remote', () => {
    const fi = { name: 'Finland', code: 'FI', slug: 'finland' };
    expect(at('Remote', undefined, fi)).toEqual({
        codes: ['FI'],
        model: 'remote',
        flag: undefined,
    });
    expect(at('Worldwide', undefined, fi)).toEqual({
        codes: ['FI'],
        model: 'remote',
        flag: undefined,
    });
});
test('unplaceable remote text is flagged under Europe', () => {
    expect(at('Remote - Region 4')).toEqual({
        codes: ['EU'],
        model: 'remote',
        flag: 'Remote - Region 4',
    });
});
test('ATS remote with unknown text is flagged under Europe', () => {
    expect(at('Region 4', 'remote')).toEqual({
        codes: ['EU'],
        model: 'remote',
        flag: 'Region 4',
    });
});
test('unknown text without a remote marker is skipped', () => {
    expect(at('Somewhere Unknown')).toEqual({
        codes: [],
        model: null,
        flag: undefined,
    });
});
test('a named country keeps its own work model', () => {
    expect(at('Berlin, Germany', 'hybrid')).toEqual({
        codes: ['DE'],
        model: 'hybrid',
        flag: undefined,
    });
    expect(at('Hybrid - Berlin, Germany')).toEqual({
        codes: ['DE'],
        model: 'hybrid',
        flag: undefined,
    });
    expect(at('Berlin, Germany')).toEqual({
        codes: ['DE'],
        model: null,
        flag: undefined,
    });
});
test('a named untracked place keeps its own work model', () => {
    expect(at('Remote - Austin, TX')).toEqual({
        codes: ['US'],
        model: 'remote',
        flag: undefined,
    });
});

const rawAt = (job: Omit<RawJob, 'title'>) => {
    const p = placeRawJob({ title: 'Engineer', ...job }, null);
    return { codes: p.countries.map((c) => c.code), model: p.workModel };
};

test('a country_code job keeps the work model written in its location', () => {
    expect(
        rawAt({ country_code: 'FI', location: 'Remote - Helsinki' }),
    ).toEqual({ codes: ['FI'], model: 'remote' });
});
test('a hybrid location text sets the work model', () => {
    expect(rawAt({ location: 'Hybrid - Berlin, Germany' })).toEqual({
        codes: ['DE'],
        model: 'hybrid',
    });
});
test('an ATS work model wins over the location text', () => {
    expect(
        rawAt({
            country_code: 'FI',
            location: 'Helsinki',
            work_model: 'on-site',
        }),
    ).toEqual({ codes: ['FI'], model: 'on-site' });
});

const FI = { name: 'Finland', code: 'FI', slug: 'finland' };
const tracked = (job: Omit<RawJob, 'title'>, fb: CountryInfo | null = null) =>
    isPlacedInTrackedCountry({ title: 'Engineer', ...job }, fb);

test('a job placed in a tracked country or Europe is tracked', () => {
    expect(tracked({ location: 'Remote' })).toBe(true);
    expect(tracked({ location: 'Remote - Region 4' })).toBe(true);
    expect(tracked({ location: 'Berlin, Germany' })).toBe(true);
    expect(tracked({ location: 'Region 4', work_model: 'remote' })).toBe(true);
    expect(tracked({ country_code: 'FI', location: 'Remote - Helsinki' })).toBe(
        true,
    );
});
test('a job placed outside tracked countries or not placed is not tracked', () => {
    expect(tracked({ location: 'Austin, TX' })).toBe(false);
    expect(tracked({ location: 'Remote (EST)' })).toBe(false);
    expect(tracked({ location: '' })).toBe(false);
    expect(tracked({})).toBe(false);
});
test('a placeless job with a company fallback is tracked', () => {
    expect(tracked({ location: '', work_model: 'remote' }, FI)).toBe(true);
    expect(tracked({ location: '' }, FI)).toBe(true);
});
test('a location string is tracked when placement lands in a tracked country', () => {
    const at = isLocationPlacedInTrackedCountry;
    expect(at('Remote', null)).toBe(true);
    expect(at('Remote - Region 4', null)).toBe(true);
    expect(at('Worldwide', null)).toBe(true);
    expect(at('Berlin, Germany', null)).toBe(true);
    expect(at('Austin, TX', null)).toBe(false);
    expect(at('Somewhere Unknown', null)).toBe(false);
    expect(at('', null)).toBe(false);
    expect(at('', FI)).toBe(true);
});
test('unknown text after a leading Remote parenthesis is flagged under Europe', () => {
    expect(at('Remote (Unknownville)')).toEqual({
        codes: ['EU'],
        model: 'remote',
        flag: 'Remote (Unknownville)',
    });
    expect(at('Remote (Europe/Americas)')).toMatchObject({
        codes: ['EU'],
        model: 'remote',
    });
    expect(at('Remote (Worldwide)')).toEqual({
        codes: ['EU'],
        model: 'remote',
        flag: undefined,
    });
    expect(at('Fully Remote (Unknownville)')).toMatchObject({
        codes: ['EU'],
        model: 'remote',
    });
});
test('a leading Remote parenthesis keeps its timezone and country reading', () => {
    expect(at('Remote (PT)')).toEqual({
        codes: ['XX'],
        model: 'remote',
        flag: undefined,
    });
    expect(at('Remote (CET)')).toEqual({
        codes: ['EU'],
        model: 'remote',
        flag: undefined,
    });
    expect(at('Remote (EST)')).toEqual({
        codes: ['XX'],
        model: 'remote',
        flag: undefined,
    });
    expect(at('Remote (Germany)')).toEqual({
        codes: ['DE'],
        model: 'remote',
        flag: undefined,
    });
});
test('named timezones use their real offsets in ranges', () => {
    for (const loc of [
        'Remote, UTC-8 to PST',
        'Remote, UTC-10 to EST',
        'Remote, UTC+4 to IST',
        'Remote, UTC-9 to PT',
    ]) {
        expect(at(loc).codes).toEqual(['XX']);
    }
    for (const loc of [
        'Remote, PST to CET',
        'Remote, EST to UTC+2',
        'Remote, UTC-1 to WET',
    ]) {
        expect(at(loc)).toEqual({
            codes: ['EU'],
            model: 'remote',
            flag: undefined,
        });
    }
});
test('or and slash alternatives in a Remote parenthesis are each read', () => {
    expect(at('Remote (CET or EST)')).toEqual({
        codes: ['EU'],
        model: 'remote',
        flag: undefined,
    });
    expect(at('Remote (Europe/Americas)')).toEqual({
        codes: ['EU'],
        model: 'remote',
        flag: undefined,
    });
    expect(at('Remote (PST or EST)').codes).toEqual(['XX']);
    expect(at('Remote (Americas/APAC)').codes).toEqual(['XX']);
    expect(at('Remote (Germany or Austria)').codes).toEqual(['AT', 'DE']);
    expect(at('Remote (ET/PT)').codes).toEqual(['XX']);
    expect(at('Remote (Lisbon, PT)').codes).toEqual(['PT']);
});
test('a lowercase timezone alone in a Remote parenthesis is still a timezone', () => {
    expect(at('remote (est)').codes).toEqual(['XX']);
    expect(at('Remote (pst)').codes).toEqual(['XX']);
    expect(at('remote (pt)').codes).toEqual(['XX']);
    expect(at('remote (cet)')).toEqual({
        codes: ['EU'],
        model: 'remote',
        flag: undefined,
    });
    expect(at('Remote, est').codes).toEqual(['EE']);
    expect(at('Tallinn, est').codes).toEqual(['EE']);
});
test('an IANA zone in a Remote parenthesis is a timezone', () => {
    for (const loc of [
        'Remote (Europe/Berlin)',
        'Remote (Europe/London)',
        'Remote (europe/lisbon)',
        'Remote (Atlantic/Canary)',
    ]) {
        expect(at(loc)).toEqual({
            codes: ['EU'],
            model: 'remote',
            flag: undefined,
        });
    }
    expect(at('Remote (America/New_York)').codes).toEqual(['XX']);
    expect(at('Remote (America/Argentina/Buenos_Aires)').codes).toEqual(['XX']);
    expect(at('Remote (Asia/Kolkata)').codes).toEqual(['XX']);
    expect(at('Remote (Atlantic/Bermuda)').codes).toEqual(['XX']);
    expect(at('Remote (Europe/Americas)')).toEqual({
        codes: ['EU'],
        model: 'remote',
        flag: undefined,
    });
});
