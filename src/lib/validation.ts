import { z } from 'zod';
import { CATEGORIES } from './categories';

const VALID_CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug);

// z.url() alone accepts javascript:/data:, and these end up in href. Anything
// outside the allowlist drops to undefined so one bad URL can't 422 a whole upload.
const urlTransform = z
    .string()
    .transform((val) => val.replace(/^\[.*?\]\((.*?)\)$/, '$1').trim())
    .pipe(z.url({ protocol: /^(https?|mailto)$/ }).or(z.literal('')))
    .optional()
    .catch(undefined);

export const PositionSchema = z.object({
    country_code: z.string().length(2).toUpperCase().optional(),
    title: z.string().min(1, 'Position title is required'),
    url: urlTransform,
    city: z.array(z.string()).optional(),
    work_model: z.enum(['remote', 'hybrid', 'on-site']).optional(),
    requires_native_language: z.boolean({
        error: 'requires_native_language must be true or false',
    }),
    local_language_advantage: z.boolean().default(false),
    required_languages: z.array(z.string()).default([]),
    preferred_languages: z.array(z.string()).default([]),
    skills: z.array(z.string()).default([]),
    required_education: z
        .enum(['vocational', 'bachelor', 'master', 'mba', 'phd'])
        .optional(),
    category: z.string().superRefine((val, ctx) => {
        if (!VALID_CATEGORY_SLUGS.includes(val)) {
            ctx.addIssue({
                code: 'custom',
                message: `Invalid category "${val}". Must be one of: ${VALID_CATEGORY_SLUGS.join(', ')}`,
            });
        }
    }),
});

export const CompanyEntrySchema = z.object({
    company_name: z.string().min(1, 'Company name is required'),
    country: z.string().min(1, 'Country slug is required'),
    country_name: z.string().min(1, 'Country name is required'),
    country_code: z
        .string()
        .length(2, 'Country code must be ISO alpha-2 (2 letters)')
        .toUpperCase(),
    career_page_url: urlTransform,
    is_english_company: z.boolean().default(false),
    positions: z
        .array(PositionSchema)
        .min(1, 'At least one position is required'),
});

// Wrapper format: { total_positions: number, companies: [...] }
const WrappedSchema = z.object({
    total_positions: z.number().int().nonnegative(),
    companies: z
        .array(CompanyEntrySchema)
        .min(1, 'Companies array must contain at least one entry'),
});

// Accept: single entry, bare array, or wrapped object with total_positions
export const UploadSchema = z.union([
    WrappedSchema,
    CompanyEntrySchema,
    z.array(CompanyEntrySchema).min(1, 'Array must contain at least one entry'),
]);

// Normalise to always be an array of entries
export function normaliseUpload(
    data: z.infer<typeof UploadSchema>,
): z.infer<typeof CompanyEntrySchema>[] {
    if ('total_positions' in data && 'companies' in data) {
        return (data as z.infer<typeof WrappedSchema>).companies;
    }
    return Array.isArray(data) ? data : [data];
}

// Extract total_positions from wrapped format, or null if not present
export function extractTotalPositions(
    data: z.infer<typeof UploadSchema>,
): number | null {
    if (
        typeof data === 'object' &&
        !Array.isArray(data) &&
        'total_positions' in data
    ) {
        return (data as z.infer<typeof WrappedSchema>).total_positions;
    }
    return null;
}

export type UploadPayload = z.infer<typeof UploadSchema>;
export type CompanyEntry = z.infer<typeof CompanyEntrySchema>;
export type PositionInput = z.infer<typeof PositionSchema>;
