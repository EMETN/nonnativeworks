import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type EntityType = 'company' | 'position' | 'skill';
export type ChangeAction = 'created' | 'updated' | 'deleted';

export interface ChangeInput {
    entity_type: EntityType;
    action: ChangeAction;
    label: string;
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
