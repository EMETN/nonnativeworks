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

export type Grouping = 'company' | 'country' | 'company-country' | null;

export function resolveScope(
    companies: ScopeCompany[],
    company: string,
    countryId: string,
): { query: string; grouping: Grouping } | null {
    if (!company || company === ALL_COMPANIES) {
        if (countryId && countryId !== ALL_COUNTRIES) {
            return {
                query: `?country_id=${encodeURIComponent(countryId)}`,
                grouping: 'company',
            };
        }
        return company || countryId
            ? { query: '', grouping: 'company-country' }
            : null;
    }

    const ids = companies
        .filter((c) => c.name === company && matchesCountry(c, countryId))
        .map((c) => `company_id=${encodeURIComponent(c.company_id)}`);
    if (ids.length === 0) return null;
    return {
        query: `?${ids.join('&')}`,
        grouping: ids.length > 1 ? 'country' : null,
    };
}

type GroupablePosition = Pick<
    AdminPosition,
    'requires_native_language' | 'company'
>;

export interface PositionGroup<T> {
    key: string;
    label: string;
    note?: string;
    english: number;
    total: number;
    positions: T[];
    children: PositionGroup<T>[];
    companyId?: string;
}

function groupBy<T extends GroupablePosition>(
    positions: T[],
    labelOf: (position: T) => string,
    keyPrefix = '',
): PositionGroup<T>[] {
    const byLabel = new Map<string, T[]>();
    for (const position of positions) {
        const label = labelOf(position);
        const rows = byLabel.get(label);
        if (rows) rows.push(position);
        else byLabel.set(label, [position]);
    }
    return [...byLabel]
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([label, rows]) => ({
            key: `${keyPrefix}${label}`,
            label,
            english: rows.filter((p) => !p.requires_native_language).length,
            total: rows.length,
            positions: rows,
            children: [],
        }));
}

const companyName = (p: GroupablePosition) => p.company?.name ?? '';
const countryName = (p: GroupablePosition) => p.company?.country_name ?? '';

export function groupPositions<T extends GroupablePosition>(
    positions: T[],
    grouping: Grouping,
): PositionGroup<T>[] {
    if (!grouping) return [];

    const groups = groupBy(
        positions,
        grouping === 'country' ? countryName : companyName,
    );
    if (grouping === 'company-country') {
        for (const group of groups) {
            const countries = groupBy(
                group.positions,
                countryName,
                `${group.label}/`,
            );
            if (countries.length > 1) group.children = countries;
            else group.note = countries[0]?.label;
        }
    }

    const singleLevel = groups.length === 1 && !groups[0]?.children.length;
    return singleLevel ? [] : groups;
}

type CatalogCompany = Pick<
    AdminCompany,
    | 'company_id'
    | 'name'
    | 'country_name'
    | 'total_positions'
    | 'english_positions'
>;

function catalogLeaf<T>(
    row: CatalogCompany,
    key: string,
    label: string,
): PositionGroup<T> {
    return {
        key,
        label,
        english: row.english_positions,
        total: row.total_positions,
        positions: [],
        children: [],
        companyId: row.company_id,
    };
}

export function catalogGroups<T>(
    companies: CatalogCompany[],
    limit: number,
): { groups: PositionGroup<T>[]; total: number } {
    const byName = new Map<string, CatalogCompany[]>();
    for (const company of companies) {
        if (company.total_positions === 0) continue;
        const rows = byName.get(company.name);
        if (rows) rows.push(company);
        else byName.set(company.name, [company]);
    }

    const names = [...byName.keys()].sort((a, b) => a.localeCompare(b, 'en'));
    const groups = names.slice(0, limit).map((name): PositionGroup<T> => {
        const rows = (byName.get(name) ?? []).sort((a, b) =>
            a.country_name.localeCompare(b.country_name, 'en'),
        );
        const [only] = rows;
        if (only && rows.length === 1) {
            return {
                ...catalogLeaf<T>(only, name, name),
                note: only.country_name,
            };
        }
        return {
            key: name,
            label: name,
            english: rows.reduce((sum, c) => sum + c.english_positions, 0),
            total: rows.reduce((sum, c) => sum + c.total_positions, 0),
            positions: [],
            children: rows.map((row) =>
                catalogLeaf<T>(
                    row,
                    `${name}/${row.country_name}`,
                    row.country_name,
                ),
            ),
        };
    });
    return { groups, total: names.length };
}
