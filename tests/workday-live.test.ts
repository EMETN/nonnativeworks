import { readFileSync } from 'node:fs';
import { describe, test, expect } from 'vitest';
import { fetchWorkdayJobs, parseWorkdayUrl } from '../src/lib/ats/workday';
import { lookupCountryFromLocation } from '../src/lib/ats/country-lookup';
import { TRACKED_COUNTRY_CODES } from '../src/lib/tracked-countries';

// Hits the real Workday APIs, so it only runs via `pnpm test:live`.
const LIVE = process.env.WORKDAY_LIVE === '1';

const companiesYaml = readFileSync('scraper/companies.yaml', 'utf8');
const workdayCompanies = [
    ...companiesYaml.matchAll(
        /- name: (.+)\n\s+url: (https:\/\/\S+\.myworkday(?:jobs|site)\.com\S*)/g,
    ),
].map(([, name, url]) => ({ name: name.trim(), url }));

const resolvesToTracked = (loc: string) =>
    lookupCountryFromLocation(loc).some((c) =>
        TRACKED_COUNTRY_CODES.has(c.code),
    );

describe.runIf(LIVE)('Workday tenants (live)', () => {
    test('companies.yaml lists Workday tenants', () => {
        expect(workdayCompanies.length).toBeGreaterThan(0);
    });

    test.each(workdayCompanies)(
        '$name returns jobs in tracked countries',
        async ({ url }) => {
            const jobs = await fetchWorkdayJobs(parseWorkdayUrl(url)!);

            expect(
                jobs.filter((j) =>
                    resolvesToTracked(j.country_code ?? j.location ?? ''),
                ).length,
            ).toBeGreaterThan(0);
        },
        300_000,
    );

    test('Dentsu matches the site count for every tracked country', async () => {
        const { url } = workdayCompanies.find((c) => c.name === 'Dentsu')!;
        const parts = parseWorkdayUrl(url)!;
        const res = await fetch(
            `https://${parts.host}/wday/cxs/${parts.company}/${parts.site}/jobs`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    appliedFacets: {},
                    limit: 1,
                    offset: 0,
                    searchText: '',
                }),
            },
        );
        interface Facet {
            facetParameter?: string;
            id?: string;
            descriptor?: string;
            count?: number;
            values?: Facet[];
        }
        // Country facets can sit inside a parent group (e.g. locationMainGroup).
        const countryValues = (facets: Facet[] = []): Facet[] =>
            facets.flatMap((f) => [
                ...(f.facetParameter === 'locationCountry'
                    ? (f.values ?? [])
                    : []),
                ...countryValues(f.values),
            ]);
        const { facets } = (await res.json()) as { facets: Facet[] };
        const siteCounts = Object.fromEntries(
            countryValues(facets)
                .filter(
                    (v) =>
                        (!parts.appliedFacets?.locationCountry ||
                            parts.appliedFacets.locationCountry.includes(
                                v.id!,
                            )) &&
                        resolvesToTracked(v.descriptor!),
                )
                .map((v) => [v.descriptor, v.count]),
        );

        const jobs = await fetchWorkdayJobs(parts);
        const scrapedCounts: Record<string, number> = {};
        for (const j of jobs)
            scrapedCounts[j.country_code!] =
                (scrapedCounts[j.country_code!] ?? 0) + 1;

        expect(scrapedCounts).toEqual(siteCounts);
    }, 300_000);
});
