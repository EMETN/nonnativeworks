import DataGrid from '../shared/DataGrid';
import type { DataGridItem } from '../shared/DataGrid';

interface CountryEntry {
    country_name: string;
    country_slug: string;
    country_code: string;
    career_page_url: string | null;
    english_positions: number;
    total_positions: number;
}

interface Props {
    entries: CountryEntry[];
    companySlug: string;
}

export default function CompanyCountryGrid({ entries, companySlug }: Props) {
    const items: DataGridItem[] = entries.map((e) => ({
        id: e.country_slug,
        name: e.country_name,
        href: `/${e.country_slug}/${companySlug}`,
        flag: `/flags/${e.country_code.toLowerCase()}.png`,
        career_page_url: e.career_page_url,
        english_positions: e.english_positions,
        total_positions: e.total_positions,
        english_percentage:
            e.total_positions > 0
                ? Math.round((e.english_positions / e.total_positions) * 100)
                : 0,
        updated_at: null,
    }));

    return <DataGrid items={items} entityName="country" />;
}
