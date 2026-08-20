export interface ChangeGroup {
    entity_type: string;
    action: string;
    count: number;
}

export interface ChangeSummary {
    changeCount: number;
    changes: ChangeGroup[];
}

export function summariseChanges(rows: ChangeGroup[]): ChangeSummary {
    const changes = rows
        .filter((r) => r.count > 0)
        .sort((a, b) =>
            a.entity_type === b.entity_type
                ? a.action.localeCompare(b.action)
                : a.entity_type.localeCompare(b.entity_type),
        );
    const changeCount = changes.reduce((sum, r) => sum + r.count, 0);
    return { changeCount, changes };
}

export function pluralise(entity: string, count: number): string {
    if (count === 1) return entity;
    return entity === 'company' ? 'companies' : `${entity}s`;
}

export function changeLineText(group: ChangeGroup): string {
    return `${group.count} ${pluralise(group.entity_type, group.count)} ${group.action}`;
}

export function buildPublishLabel(changeCount: number): string {
    if (changeCount <= 0) return 'Publish';
    return `Publish ${changeCount} change${changeCount === 1 ? '' : 's'}`;
}

export type DeployEvent = 'building' | 'ready' | 'error';

export interface BuildRow {
    state: string;
    started_at: string | null;
    created_at: string;
}

export function deriveBuildInFlight(
    rows: BuildRow[],
    now: number,
    staleMinutes: number,
): boolean {
    const cutoff = now - staleMinutes * 60_000;
    return rows.some((r) => {
        if (r.state !== 'building') return false;
        const at = Date.parse(r.started_at ?? r.created_at);
        return Number.isFinite(at) && at >= cutoff;
    });
}

export function mapDeployNotification(payload: {
    id?: string;
    state?: string;
    context?: string;
}): {
    deploy_id: string;
    state: DeployEvent;
    started_at: string | null;
    finished_at: string | null;
} | null {
    if (!payload.id) return null;
    // Only production deploys are the "live" site. Ignore deploy-preview and
    // branch-deploy builds so they never move the published baseline. Absent
    // context is treated as production for backward compatibility.
    if (payload.context && payload.context !== 'production') return null;
    const now = new Date().toISOString();
    switch (payload.state) {
        case 'building':
            return {
                deploy_id: payload.id,
                state: 'building',
                started_at: now,
                finished_at: null,
            };
        case 'ready':
            return {
                deploy_id: payload.id,
                state: 'ready',
                started_at: null,
                finished_at: now,
            };
        case 'error':
        case 'failed':
            return {
                deploy_id: payload.id,
                state: 'error',
                started_at: null,
                finished_at: now,
            };
        default:
            return null;
    }
}
