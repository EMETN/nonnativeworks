import type { AdminCompany, AdminPosition } from './admin-schemas';

export const ALL_COMPANIES = '__all__';
export const ALL_COUNTRIES = '__all_countries__';

type ScopeCompany = Pick<
    AdminCompany,
    'company_id' | 'name' | 'country_id' | 'country_name' | 'total_positions'
>;

export interface ScopeOption {
    value: string;
    label: string;
    available: boolean;
}

const matchesCountry = (company: ScopeCompany, countryId: string) =>
    !countryId ||
    countryId === ALL_COUNTRIES ||
    company.country_id === countryId;

const matchesCompany = (row: ScopeCompany, company: string) =>
    !company || company === ALL_COMPANIES || row.name === company;

function toOptions(
    labels: Map<string, string>,
    withPositions: ScopeCompany[],
    valueOf: (row: ScopeCompany) => string,
    selected: string,
): ScopeOption[] {
    const reachable = new Set(withPositions.map(valueOf)).add(selected);
    return [...labels]
        .map(([value, label]) => ({
            value,
            label,
            available: reachable.has(value),
        }))
        .sort(
            (a, b) =>
                Number(b.available) - Number(a.available) ||
                a.label.localeCompare(b.label, 'en'),
        );
}

export function companyOptions(
    companies: ScopeCompany[],
    company: string,
    countryId: string,
): ScopeOption[] {
    return toOptions(
        new Map(companies.map((c) => [c.name, c.name])),
        companies.filter(
            (c) => c.total_positions > 0 && matchesCountry(c, countryId),
        ),
        (c) => c.name,
        company,
    );
}

export function countryOptions(
    companies: ScopeCompany[],
    company: string,
    countryId: string,
): ScopeOption[] {
    return toOptions(
        new Map(companies.map((c) => [c.country_id, c.country_name])),
        companies.filter(
            (c) => c.total_positions > 0 && matchesCompany(c, company),
        ),
        (c) => c.country_id,
        countryId,
    );
}

export interface PositionSummary {
    english: number;
    total: number;
    companies: number;
    countries: number;
}

export function catalogSummary(
    companies: Pick<
        AdminCompany,
        'name' | 'country_name' | 'total_positions' | 'english_positions'
    >[],
): PositionSummary {
    return {
        english: companies.reduce((sum, c) => sum + c.english_positions, 0),
        total: companies.reduce((sum, c) => sum + c.total_positions, 0),
        companies: new Set(companies.map((c) => c.name)).size,
        countries: new Set(companies.map((c) => c.country_name)).size,
    };
}

export function positionSummary(
    positions: Pick<AdminPosition, 'requires_native_language' | 'company'>[],
): PositionSummary {
    return {
        english: positions.filter((p) => !p.requires_native_language).length,
        total: positions.length,
        companies: new Set(positions.map((p) => p.company?.name)).size,
        countries: new Set(positions.map((p) => p.company?.country_name)).size,
    };
}

export function resolveScope(
    companies: ScopeCompany[],
    company: string,
    countryId: string,
): { query: string; multiCompany: boolean } | null {
    if (!company || company === ALL_COMPANIES) {
        if (countryId && countryId !== ALL_COUNTRIES) {
            return {
                query: `?country_id=${encodeURIComponent(countryId)}`,
                multiCompany: true,
            };
        }
        return company || countryId ? { query: '', multiCompany: true } : null;
    }

    const ids = companies
        .filter((c) => c.name === company && matchesCountry(c, countryId))
        .map((c) => `company_id=${encodeURIComponent(c.company_id)}`);
    if (ids.length === 0) return null;
    return { query: `?${ids.join('&')}`, multiCompany: ids.length > 1 };
}
