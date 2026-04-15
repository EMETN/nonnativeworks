import DataGrid from '../shared/DataGrid';
import type { DataGridItem } from '../shared/DataGrid';

interface CountryData {
    name: string;
    slug: string;
    code: string;
    flag_colors: string[];
    total_positions: number;
    english_positions: number;
    english_percentage: number;
    last_updated: string | null;
    country_id: string;
}

interface Props {
    countries: CountryData[];
    companyCounts: Record<string, number>;
}

export default function InfographicGrid({ countries, companyCounts }: Props) {
    const items: DataGridItem[] = countries.map((c) => ({
        id: c.slug,
        name: c.name,
        href: `/${c.slug}`,
        english_positions: c.english_positions,
        total_positions: c.total_positions,
        english_percentage: c.english_percentage,
        updated_at: c.last_updated,
        company_count: companyCounts[c.country_id] ?? 0,
    }));

    return <DataGrid items={items} compact />;
}
