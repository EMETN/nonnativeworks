// TypeScript types matching the database schema

export interface Country {
  id: string;
  name: string;
  slug: string;
  code: string;
  flag_colors: string[];
  sort_order: number;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
}

export interface Company {
  id: string;
  name: string;
  country_id: string;
  career_page_url: string | null;
  is_english_company: boolean;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: string;
  company_id: string;
  title: string;
  url: string | null;
  category_id: string;
  requires_native_language: boolean;
  local_language_advantage: boolean;
  extracted_at: string;
}

export interface PositionDetail {
  id: string;
  company_id: string;
  title: string;
  url: string | null;
  category_name: string;
  requires_native_language: boolean;
  local_language_advantage: boolean;
}

// View types

export interface CountryStats {
  country_id: string;
  name: string;
  slug: string;
  code: string;
  flag_colors: string[];
  sort_order: number;
  total_positions: number;
  english_positions: number;
  english_percentage: number;
  last_updated: string | null;
}

export interface CompanyStats {
  company_id: string;
  name: string;
  country_id: string;
  career_page_url: string | null;
  is_english_company: boolean;
  updated_at: string;
  total_positions: number;
  english_positions: number;
  english_percentage: number;
  categories: string[] | null;
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
