/**
 * Hand-maintained `Database` type mirroring `supabase gen types typescript`;
 * update it in step with supabase/migrations when the schema changes.
 *
 * Table rows match the generated output. Views diverge on purpose: Postgres
 * (and gen types) marks every view column nullable, but here columns from a
 * NOT NULL base column stay non-null — only true aggregates (`last_updated`,
 * `categories`, `career_page_url`) are nullable.
 */

export type WorkModel = 'remote' | 'hybrid' | 'on-site';

export type RequiredEducation =
    'vocational' | 'bachelor' | 'master' | 'mba' | 'phd';

export type SkillCategory =
    | 'language'
    | 'framework'
    | 'database'
    | 'cloud'
    | 'tool'
    | 'methodology'
    | 'api_style'
    | 'certification'
    | 'platform';

export type Database = {
    public: {
        Tables: {
            countries: {
                Row: {
                    id: string;
                    name: string;
                    slug: string;
                    code: string;
                    flag_colors: string[];
                    sort_order: number;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    name: string;
                    slug: string;
                    code: string;
                    flag_colors: string[];
                    sort_order?: number;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    name?: string;
                    slug?: string;
                    code?: string;
                    flag_colors?: string[];
                    sort_order?: number;
                    created_at?: string;
                };
                Relationships: [];
            };
            categories: {
                Row: {
                    id: string;
                    name: string;
                    slug: string;
                    sort_order: number;
                };
                Insert: {
                    id?: string;
                    name: string;
                    slug: string;
                    sort_order?: number;
                };
                Update: {
                    id?: string;
                    name?: string;
                    slug?: string;
                    sort_order?: number;
                };
                Relationships: [];
            };
            companies: {
                Row: {
                    id: string;
                    name: string;
                    country_id: string;
                    career_page_url: string | null;
                    is_english_company: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    name: string;
                    country_id: string;
                    career_page_url?: string | null;
                    is_english_company?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    name?: string;
                    country_id?: string;
                    career_page_url?: string | null;
                    is_english_company?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'companies_country_id_fkey';
                        columns: ['country_id'];
                        referencedRelation: 'countries';
                        referencedColumns: ['id'];
                    },
                ];
            };
            positions: {
                Row: {
                    id: string;
                    company_id: string;
                    title: string;
                    category_id: string;
                    requires_native_language: boolean;
                    local_language_advantage: boolean;
                    url: string | null;
                    city: string[] | null;
                    required_languages: string[];
                    preferred_languages: string[];
                    work_model: WorkModel | null;
                    skills: string[];
                    required_education: RequiredEducation | null;
                    extracted_at: string;
                };
                Insert: {
                    id?: string;
                    company_id: string;
                    title: string;
                    category_id: string;
                    requires_native_language?: boolean;
                    local_language_advantage?: boolean;
                    url?: string | null;
                    city?: string[] | null;
                    required_languages?: string[];
                    preferred_languages?: string[];
                    work_model?: WorkModel | null;
                    skills?: string[];
                    required_education?: RequiredEducation | null;
                    extracted_at?: string;
                };
                Update: {
                    id?: string;
                    company_id?: string;
                    title?: string;
                    category_id?: string;
                    requires_native_language?: boolean;
                    local_language_advantage?: boolean;
                    url?: string | null;
                    city?: string[] | null;
                    required_languages?: string[];
                    preferred_languages?: string[];
                    work_model?: WorkModel | null;
                    skills?: string[];
                    required_education?: RequiredEducation | null;
                    extracted_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'positions_company_id_fkey';
                        columns: ['company_id'];
                        referencedRelation: 'companies';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'positions_category_id_fkey';
                        columns: ['category_id'];
                        referencedRelation: 'categories';
                        referencedColumns: ['id'];
                    },
                ];
            };
            company_snapshots: {
                Row: {
                    id: string;
                    company_name: string;
                    country_id: string;
                    total_positions: number;
                    english_positions: number;
                    snapshotted_at: string;
                };
                Insert: {
                    id?: string;
                    company_name: string;
                    country_id: string;
                    total_positions: number;
                    english_positions: number;
                    snapshotted_at?: string;
                };
                Update: {
                    id?: string;
                    company_name?: string;
                    country_id?: string;
                    total_positions?: number;
                    english_positions?: number;
                    snapshotted_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'company_snapshots_country_id_fkey';
                        columns: ['country_id'];
                        referencedRelation: 'countries';
                        referencedColumns: ['id'];
                    },
                ];
            };
            skills: {
                Row: {
                    id: string;
                    canonical_name: string;
                    category: SkillCategory;
                    aliases: string[];
                    is_legacy: boolean;
                };
                Insert: {
                    id?: string;
                    canonical_name: string;
                    category: SkillCategory;
                    aliases?: string[];
                    is_legacy?: boolean;
                };
                Update: {
                    id?: string;
                    canonical_name?: string;
                    category?: SkillCategory;
                    aliases?: string[];
                    is_legacy?: boolean;
                };
                Relationships: [];
            };
            skill_snapshots: {
                Row: {
                    id: string;
                    captured_at: string;
                    company_id: string;
                    country_id: string;
                    category_id: string;
                    skill_id: string;
                    position_count: number;
                };
                Insert: {
                    id?: string;
                    captured_at: string;
                    company_id: string;
                    country_id: string;
                    category_id: string;
                    skill_id: string;
                    position_count: number;
                };
                Update: {
                    id?: string;
                    captured_at?: string;
                    company_id?: string;
                    country_id?: string;
                    category_id?: string;
                    skill_id?: string;
                    position_count?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: 'skill_snapshots_company_id_fkey';
                        columns: ['company_id'];
                        referencedRelation: 'companies';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'skill_snapshots_country_id_fkey';
                        columns: ['country_id'];
                        referencedRelation: 'countries';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'skill_snapshots_category_id_fkey';
                        columns: ['category_id'];
                        referencedRelation: 'categories';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'skill_snapshots_skill_id_fkey';
                        columns: ['skill_id'];
                        referencedRelation: 'skills';
                        referencedColumns: ['id'];
                    },
                ];
            };
        };
        Views: {
            country_stats: {
                Row: {
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
                };
                Relationships: [];
            };
            company_stats: {
                Row: {
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
                };
                Relationships: [
                    {
                        foreignKeyName: 'companies_country_id_fkey';
                        columns: ['country_id'];
                        referencedRelation: 'countries';
                        referencedColumns: ['id'];
                    },
                ];
            };
        };
        Functions: {
            count_distinct_companies: {
                Args: Record<PropertyKey, never>;
                Returns: number;
            };
            top_companies_by_english: {
                Args: { lim?: number };
                Returns: {
                    name: string;
                    total_positions: number;
                    english_positions: number;
                    english_percentage: number;
                    country_count: number;
                    primary_country_slug: string;
                    career_page_url: string | null;
                }[];
            };
        };
        Enums: {
            [_ in never]: never;
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
};

export type Tables<T extends keyof Database['public']['Tables']> =
    Database['public']['Tables'][T]['Row'];
export type Views<T extends keyof Database['public']['Views']> =
    Database['public']['Views'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
    Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
    Database['public']['Tables'][T]['Update'];
