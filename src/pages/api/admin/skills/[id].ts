import type { APIRoute } from 'astro';
import { createSupabaseServiceClient } from '../../../../lib/supabase';
import type {
    SkillCategory,
    TablesUpdate,
} from '../../../../lib/database.types';
import {
    recordChange,
    changedBy,
    EXISTED,
} from '../../../../lib/admin-changes';
import { skillState } from '../skills';

export const prerender = false;

const VALID_CATEGORIES = [
    'language',
    'framework',
    'database',
    'cloud',
    'tool',
    'methodology',
    'api_style',
    'certification',
    'platform',
] as const;

function isSkillCategory(value: unknown): value is SkillCategory {
    return (
        typeof value === 'string' &&
        (VALID_CATEGORIES as readonly string[]).includes(value)
    );
}
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PATCH: APIRoute = async ({ params, request, locals }) => {
    const { id } = params;
    if (!id || !UUID_RE.test(id)) {
        return json({ error: 'Invalid skill id' }, 400);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON body' }, 400);
    }

    const patch: TablesUpdate<'skills'> = {};
    const { canonical_name, category, aliases, is_legacy } = body as Record<
        string,
        unknown
    >;

    if (canonical_name !== undefined) {
        if (typeof canonical_name !== 'string' || !canonical_name.trim()) {
            return json(
                { error: 'canonical_name must be a non-empty string' },
                400,
            );
        }
        patch.canonical_name = canonical_name.trim();
    }

    if (category !== undefined) {
        if (!isSkillCategory(category)) {
            return json(
                {
                    error: `category must be one of: ${VALID_CATEGORIES.join(', ')}`,
                },
                400,
            );
        }
        patch.category = category;
    }

    if (aliases !== undefined) {
        if (
            !Array.isArray(aliases) ||
            !aliases.every((a) => typeof a === 'string')
        ) {
            return json({ error: 'aliases must be an array of strings' }, 400);
        }
        patch.aliases = aliases
            .map((a: string) => a.trim().toLowerCase())
            .filter(Boolean);
    }

    if (is_legacy !== undefined) {
        if (typeof is_legacy !== 'boolean') {
            return json({ error: 'is_legacy must be a boolean' }, 400);
        }
        patch.is_legacy = is_legacy;
    }

    if (Object.keys(patch).length === 0) {
        return json({ error: 'No fields to update' }, 400);
    }

    const supabase = createSupabaseServiceClient();
    const { data: before } = await supabase
        .from('skills')
        .select('canonical_name, category, aliases, is_legacy')
        .eq('id', id)
        .maybeSingle();

    const { data, error } = await supabase
        .from('skills')
        .update(patch)
        .eq('id', id)
        .select('id, canonical_name, category, aliases, is_legacy')
        .single();

    if (error) {
        if (error.code === '23505') {
            return json(
                { error: `A skill with that name already exists` },
                409,
            );
        }
        if (error.code === 'PGRST116') {
            return json({ error: 'Skill not found' }, 404);
        }
        console.error('PATCH /api/admin/skills/[id]:', error.message);
        return json({ error: 'Failed to update skill' }, 500);
    }

    await recordChange(supabase, {
        entity_type: 'skill',
        action: 'updated',
        label: data?.canonical_name ?? id,
        entity_id: id,
        before_state: before ? skillState(before) : null,
        after_state: skillState(data),
        changed_by: changedBy(locals, request),
    });

    return json(data, 200);
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
    const { id } = params;
    if (!id || !UUID_RE.test(id)) {
        return json({ error: 'Invalid skill id' }, 400);
    }

    const supabase = createSupabaseServiceClient();

    const { data: existing } = await supabase
        .from('skills')
        .select('canonical_name')
        .eq('id', id)
        .maybeSingle();

    const { error } = await supabase.from('skills').delete().eq('id', id);

    if (error) {
        console.error('DELETE /api/admin/skills/[id]:', error.message);
        return json({ error: 'Failed to delete skill' }, 500);
    }

    await recordChange(supabase, {
        entity_type: 'skill',
        action: 'deleted',
        label: existing?.canonical_name ?? id,
        entity_id: id,
        before_state: EXISTED,
        after_state: null,
        changed_by: changedBy(locals, request),
    });

    return json({ ok: true }, 200);
};

function json(data: unknown, status: number) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
