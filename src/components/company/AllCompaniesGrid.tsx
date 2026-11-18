import DataGrid from '../shared/DataGrid';
import type { DataGridItem } from '../shared/DataGrid';
import type { TopCompany } from '../../lib/queries';
import { formatCount } from '../../lib/text';

interface Props {
    companies: TopCompany[];
}

function countryCountLabel(c: TopCompany) {
    if (!c.has_region_positions) return {};
    if (c.country_count === 0)
        return {
            company_count_label: 'Remote',
            company_count_description: 'Fully remote across Europe',
        };
    return {
        company_count_label: `${formatCount(c.country_count)}*`,
        company_count_description: `${formatCount(c.country_count)} ${c.country_count === 1 ? 'country' : 'countries'}, includes fully remote positions open across Europe`,
    };
}

export default function AllCompaniesGrid({ companies }: Props) {
    const items: DataGridItem[] = companies.map((c) => ({
        id: c.primary_company_slug,
        name: c.name,
        href: `/${c.primary_company_slug}`,
        english_positions: c.english_positions,
        total_positions: c.total_positions,
        english_percentage: c.english_percentage,
        updated_at: null,
        company_count: c.country_count,
        ...countryCountLabel(c),
        career_page_url: c.career_page_url,
    }));

    return (
        <DataGrid
            items={items}
            compact
            compactLabel="Countries"
            entityName="company"
        />
    );
}
