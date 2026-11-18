import { groupBy } from './build-queries';
import { nameToSlug } from './country-flags';
import { formatCount } from './text';
import { DEFAULT_SORT, sortPositions } from './position-filters';
import type {
    CompanyStats,
    CountryStats,
    ListedPosition,
    PositionDetail,
} from './types';

/** Top-level routes, public/ entries and redirect sources; detail-paths.test.ts keeps it complete. */
export const RESERVED_SLUGS = new Set([
    '404',
    'admin',
    'api',
    'companies',
    'countries',
    'czech-republic',
    'flags',
    'index',
    't',
]);

export interface CountryPage {
    kind: 'country';
    slug: string;
    country: CountryStats;
    positions: ListedPosition[];
}

export interface CompanyPage {
    kind: 'company';
    slug: string;
    name: string;
    total_positions: number;
    english_positions: number;
    country_count: number;
    has_region_positions: boolean;
    updated_at: string;
    positions: ListedPosition[];
}

export type DetailPage = CountryPage | CompanyPage;

export function buildDetailPages(
    countries: CountryStats[],
    companies: CompanyStats[],
    positions: PositionDetail[],
): DetailPage[] {
    const countriesById = new Map(countries.map((c) => [c.country_id, c]));
    const countriesBySlug = new Map(countries.map((c) => [c.slug, c]));
    const listedCompanies = companies.filter((c) =>
        countriesById.has(c.country_id),
    );
    const companiesById = new Map(
        listedCompanies.map((c) => [c.company_id, c]),
    );

    const listed: ListedPosition[] = positions.flatMap((p) => {
        if (p.requires_native_language) return [];
        const company = companiesById.get(p.company_id);
        if (!company) return [];
        const country = countriesById.get(company.country_id)!;
        return [
            {
                ...p,
                company_name: company.name,
                company_slug: nameToSlug(company.name),
                country_name: country.name,
                country_slug: country.slug,
            },
        ];
    });

    const companyGroups = groupBy(listedCompanies, (c) => nameToSlug(c.name));

    const collisions = [...companyGroups].flatMap(([slug, group]) => {
        const name = group[0].name;
        const country = countriesBySlug.get(slug);
        if (country)
            return [
                `Company "${name}" slug "${slug}" collides with country "${country.name}"`,
            ];
        if (RESERVED_SLUGS.has(slug))
            return [
                `Company "${name}" slug "${slug}" collides with the reserved path /${slug}`,
            ];
        return [];
    });
    if (collisions.length > 0) {
        throw new Error(
            `${collisions.join('\n')}\nRename the company in admin so it gets its own URL.`,
        );
    }

    const positionsByCountry = groupBy(listed, (p) => p.country_slug);
    const positionsByCompany = groupBy(listed, (p) => p.company_slug);

    const countryPages: CountryPage[] = countries
        .filter((country) => country.total_positions > 0)
        .map((country) => ({
            kind: 'country',
            slug: country.slug,
            country,
            positions: sortPositions(
                positionsByCountry.get(country.slug) ?? [],
                DEFAULT_SORT,
            ),
        }));

    const companyPages: CompanyPage[] = [...companyGroups].map(
        ([slug, group]) => ({
            kind: 'company',
            slug,
            name: group[0].name,
            total_positions: group.reduce((n, c) => n + c.total_positions, 0),
            english_positions: group.reduce(
                (n, c) => n + c.english_positions,
                0,
            ),
            // Regions (Europe) are not countries, so they don't count towards "N countries".
            country_count: group.filter(
                (c) => !countriesById.get(c.country_id)!.is_region,
            ).length,
            has_region_positions: group.some(
                (c) =>
                    countriesById.get(c.country_id)!.is_region &&
                    c.total_positions > 0,
            ),
            updated_at: group.reduce(
                (latest, c) => (c.updated_at > latest ? c.updated_at : latest),
                group[0].updated_at,
            ),
            positions: sortPositions(
                positionsByCompany.get(slug) ?? [],
                DEFAULT_SORT,
            ),
        }),
    );

    return [...countryPages, ...companyPages];
}

export function companyDescription(
    name: string,
    totalPositions: number,
    englishPositions: number,
    countryCount: number,
    hasRegionPositions: boolean,
): string {
    const countries = ` across ${countryCount} ${countryCount === 1 ? 'country' : 'countries'}`;
    const where =
        countryCount === 0
            ? ', all fully remote across Europe'
            : hasRegionPositions
              ? `${countries} plus fully remote positions across Europe`
              : countries;
    return `${name} has ${formatCount(totalPositions)} open positions${where}, and ${formatCount(englishPositions)} don't require the local language(s).`;
}
