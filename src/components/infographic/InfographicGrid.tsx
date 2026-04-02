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
}

interface Props {
    countries: CountryData[];
}

export default function InfographicGrid({ countries }: Props) {
    const items: DataGridItem[] = countries.map((c) => ({
        id: c.slug,
        name: c.name,
        href: `/${c.slug}`,
        english_positions: c.english_positions,
        total_positions: c.total_positions,
        english_percentage: c.english_percentage,
        updated_at: c.last_updated,
    }));

    return <DataGrid items={items} compact />;
}
