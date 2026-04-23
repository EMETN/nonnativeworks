import DataGrid from '../shared/DataGrid';
import type { DataGridItem } from '../shared/DataGrid';
import type { TopCompany } from '../../lib/queries';

interface Props {
  companies: TopCompany[];
}

export default function AllCompaniesGrid({ companies }: Props) {
  const items: DataGridItem[] = companies.map((c) => ({
    id: c.primary_company_slug,
    name: c.name,
    href: `/companies/${c.primary_company_slug}`,
    english_positions: c.english_positions,
    total_positions: c.total_positions,
    english_percentage: c.english_percentage,
    updated_at: null,
    company_count: c.country_count,
  }));

  return <DataGrid items={items} compact compactLabel="Countries" />;
}
