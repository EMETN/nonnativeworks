import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type EntityType = 'company' | 'position' | 'skill';
export type ChangeAction = 'created' | 'updated' | 'deleted';

/** Sentinel `before_state` for a deletion: a non-null "the entity existed"
 *  marker, so a lone delete nets to 'deleted' while a create+delete (whose
 *  create carries before_state = null) still nets to nothing. */
export const EXISTED = 'existed';

/** Canonical content fingerprint of an entity's editable state, used to tell
 *  whether a change nets back to the published value (edit then revert = no
 *  change). Order the input deterministically before calling. */
export function hashState(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export interface ChangeInput {
    entity_type: EntityType;
    action: ChangeAction;
    label: string;
    /** Stable entity identity (position/skill id, or company name) used to
     *  collapse repeated edits of one entity into a single net change. */
    entity_id: string;
    /** Content fingerprint before the mutation (null = entity did not exist). */
    before_state: string | null;
    /** Content fingerprint after the mutation (null = entity no longer exists). */
    after_state: string | null;
    changed_by: string;
}

/** Attribution mirrors publish.ts: machine calls carry the scraper secret. */
export function changedBy(
    locals: { user?: { email?: string | null } | null } | undefined,
    request: Request,
): string {
    if (request.headers.get('x-scraper-secret')) return 'scraper';
    return locals?.user?.email ?? 'unknown';
}

/** Append one change-log row. Non-fatal: a logging failure must never break the
 *  mutation that triggered it, so errors are logged, not thrown. Call only after
 *  the underlying mutation has succeeded. */
export async function recordChange(
    supabase: SupabaseClient<Database>,
    change: ChangeInput,
): Promise<void> {
    const { error } = await supabase.from('admin_changes').insert(change);
    if (error) console.error('recordChange:', error.message);
}
