/**
 * Zod schemas for the admin API's JSON responses. Components parse `res.json()`
 * through these (previously trusted as `any`), so the inferred types are the
 * shared source of truth for the wire shape.
 */
import { z } from 'zod';

export const ErrorResponseSchema = z.object({ error: z.string().optional() });

export const AdminCompanySchema = z.object({
    company_id: z.string(),
    name: z.string(),
    country_id: z.string(),
    country_name: z.string(),
    career_page_url: z.string().nullable(),
    total_positions: z.number(),
    updated_at: z.string(),
});
export type AdminCompany = z.infer<typeof AdminCompanySchema>;
export const AdminCompanyListSchema = z.array(AdminCompanySchema);

const CategoryInfoSchema = z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
});

// `company` is absent on the lean (per-company) query and present on the
// enriched one, hence optional.
export const AdminPositionSchema = z.object({
    id: z.string(),
    title: z.string(),
    url: z.string().nullable(),
    requires_native_language: z.boolean(),
    local_language_advantage: z.boolean(),
    required_education: z.string().nullable(),
    category: CategoryInfoSchema.nullable(),
    company: z
        .object({ name: z.string(), country_name: z.string() })
        .nullable()
        .optional(),
});
export type AdminPosition = z.infer<typeof AdminPositionSchema>;
export const AdminPositionListSchema = z.array(AdminPositionSchema);

export const SkillSchema = z.object({
    id: z.string(),
    canonical_name: z.string(),
    category: z.string(),
    aliases: z.array(z.string()),
    is_legacy: z.boolean(),
});
export type Skill = z.infer<typeof SkillSchema>;
export const SkillListSchema = z.array(SkillSchema);

export const ReviewJobSchema = z.object({
    title: z.string(),
    url: z.string().optional(),
    city: z.array(z.string()).optional(),
    work_model: z.enum(['remote', 'hybrid', 'on-site']).optional(),
    category: z.string(),
    requires_native_language: z.boolean(),
    local_language_advantage: z.boolean(),
    requiredLanguages: z.array(z.string()),
    preferredLanguages: z.array(z.string()),
});
export type ReviewJob = z.infer<typeof ReviewJobSchema>;

export const ReviewCountryGroupSchema = z.object({
    country: z.string(),
    country_name: z.string(),
    country_code: z.string(),
    jobs: z.array(ReviewJobSchema),
});
export type ReviewCountryGroup = z.infer<typeof ReviewCountryGroupSchema>;

// Fields are optional because the scrape endpoint omits them freely; the
// component fills defaults. Separate from `ReviewData`, which is the fully
// populated model the editor then mutates.
export const ScrapeResponseSchema = z.object({
    ats: z.string().nullable().optional(),
    company_name: z.string().optional(),
    career_page_url: z.string().optional(),
    warning: z.string().optional(),
    skipped_unknown_location: z.number().optional(),
    skipped_untracked_country: z.number().optional(),
    countries: z.array(ReviewCountryGroupSchema).optional(),
});
export type ScrapeResponse = z.infer<typeof ScrapeResponseSchema>;

export interface ReviewData {
    ats: string | null;
    company_name: string;
    career_page_url: string;
    skipped_unknown_location: number;
    skipped_untracked_country: number;
    is_english_company: boolean;
    countries: ReviewCountryGroup[];
}

export const UploadResultSchema = z.object({
    results: z.array(
        z.object({
            company: z.string(),
            country: z.string(),
            positions: z.number(),
        }),
    ),
    errors: z.array(
        z.object({
            company: z.string(),
            country: z.string(),
            error: z.string(),
        }),
    ),
});
export type UploadResult = z.infer<typeof UploadResultSchema>;
