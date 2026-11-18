import { test, expect } from 'vitest';
import type { CountryInfo } from './country-lookup';
import type { RawJob } from './types';
import { placeJob, placeRawJob, type WorkModel } from './placement';

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
