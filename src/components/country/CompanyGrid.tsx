import DataGrid from '../shared/DataGrid';
import type { DataGridItem } from '../shared/DataGrid';
import type { CompanyStats } from '../../lib/types';
import { nameToSlug } from '../../lib/country-flags';

interface Props {
    companies: CompanyStats[];
    countrySlug: string;
}

export default function CompanyGrid({ companies, countrySlug }: Props) {
    const items: DataGridItem[] = companies.map((c) => ({
        id: c.company_id,
        name: c.name,
        href: `/${countrySlug}/${nameToSlug(c.name)}`,
        english_positions: c.english_positions,
        total_positions: c.total_positions,
        english_percentage: c.english_percentage,
        updated_at: c.updated_at,
        career_page_url: c.career_page_url,
    }));

    return <DataGrid items={items} />;
}
