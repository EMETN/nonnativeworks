// Types that mirror a table/view are derived from the Database type so they
// can't drift from the schema; the rest are UI projections.
import type { Tables, Views } from './database.types';

export type Country = Tables<'countries'>;
export type Category = Tables<'categories'>;
export type Company = Tables<'companies'>;
export type CountryStats = Views<'country_stats'>;
export type CompanyStats = Views<'company_stats'>;

export interface PositionDetail {
    id: string;
    company_id: string;
    title: string;
    url: string | null;
    category_name: string;
    requires_native_language: boolean;
    local_language_advantage: boolean;
    city: string[] | null;
    work_model: 'remote' | 'hybrid' | 'on-site' | null;
}

export interface GlobalStats {
    total_positions: number;
    english_positions: number;
    english_percentage: number;
    total_countries: number;
    total_companies: number;
}

export interface CategoryBreakdown {
    category_id: string;
    category_name: string;
    category_slug: string;
    total_positions: number;
    english_positions: number;
    english_percentage: number;
}
