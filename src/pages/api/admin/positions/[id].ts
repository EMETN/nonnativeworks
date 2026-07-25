import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createSupabaseServiceClient } from '../../../../lib/supabase';

const PatchSchema = z
    .object({
        category_slug: z.string().min(1).optional(),
        requires_native_language: z.boolean().optional(),
        local_language_advantage: z.boolean().optional(),
        required_education: z
            .enum(['vocational', 'bachelor', 'master', 'mba', 'phd'])
            .nullable()
            .optional(),
    })
    .refine((d) => Object.keys(d).length > 0, {
        message: 'At least one field must be provided',
    });

/** PATCH /api/admin/positions/:id
 *  Updates category and/or language flags on a stored position.
 *  Used by the admin Position Editor when correcting scraped data post-upload.
 */
export const PATCH: APIRoute = async ({ params, request }) => {
    const { id } = params;
    if (!id) return json({ error: 'Missing id' }, 400);

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON body' }, 400);
    }

    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
        return json(
            { error: 'Validation failed', issues: parsed.error.issues },
            422,
        );
    }

    const { category_slug, ...rest } = parsed.data;
    const update: Record<string, unknown> = { ...rest };

    const supabase = createSupabaseServiceClient();

    if (category_slug) {
        const { data: cat, error: catErr } = await supabase
            .from('categories')
            .select('id')
            .eq('slug', category_slug)
            .single();

        if (catErr || !cat) {
            return json(
                { error: `Unknown category slug: ${category_slug}` },
                422,
            );
        }
        update.category_id = cat.id;
    }

    const { error } = await supabase
        .from('positions')
        .update(update)
        .eq('id', id);

    if (error) return json({ error: error.message }, 500);
    return json({ ok: true }, 200);
};

function json(data: unknown, status: number) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
