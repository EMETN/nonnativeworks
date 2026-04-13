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
    englishBadge: c.is_english_company,
    english_positions: c.english_positions,
    total_positions: c.total_positions,
    english_percentage: c.english_percentage,
    updated_at: c.updated_at,
  }));

  return <DataGrid items={items} />;
}
