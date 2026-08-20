import { test, expect } from 'vitest';
import {
    summariseChanges,
    pluralise,
    changeLineText,
    buildPublishLabel,
    deriveBuildInFlight,
    mapDeployNotification,
} from './publish-status';

test('summariseChanges sums counts and drops empty groups', () => {
    const s = summariseChanges([
        { entity_type: 'company', action: 'updated', count: 3 },
        { entity_type: 'skill', action: 'deleted', count: 0 },
        { entity_type: 'position', action: 'updated', count: 12 },
    ]);
    expect(s.changeCount).toBe(15);
    expect(s.changes).toHaveLength(2);
});

test('summariseChanges sorts deterministically by entity then action', () => {
    const s = summariseChanges([
        { entity_type: 'skill', action: 'updated', count: 1 },
        { entity_type: 'company', action: 'deleted', count: 1 },
        { entity_type: 'company', action: 'created', count: 1 },
    ]);
    expect(s.changes.map((c) => `${c.entity_type}.${c.action}`)).toEqual([
        'company.created',
        'company.deleted',
        'skill.updated',
    ]);
});

test('pluralise respects count', () => {
    expect(pluralise('company', 1)).toBe('company');
    expect(pluralise('company', 2)).toBe('companies');
    expect(pluralise('skill', 3)).toBe('skills');
    expect(pluralise('position', 1)).toBe('position');
});

test('changeLineText composes count + noun + action', () => {
    expect(
        changeLineText({ entity_type: 'company', action: 'updated', count: 3 }),
    ).toBe('3 companies updated');
    expect(
        changeLineText({ entity_type: 'skill', action: 'deleted', count: 1 }),
    ).toBe('1 skill deleted');
});

test('buildPublishLabel', () => {
    expect(buildPublishLabel(0)).toBe('Publish');
    expect(buildPublishLabel(1)).toBe('Publish 1 change');
    expect(buildPublishLabel(4)).toBe('Publish 4 changes');
});

test('deriveBuildInFlight true for a recent building row', () => {
    const now = Date.parse('2026-08-19T12:00:00Z');
    const rows = [
        {
            state: 'building',
            started_at: '2026-08-19T11:58:00Z',
            created_at: '2026-08-19T11:58:00Z',
        },
    ];
    expect(deriveBuildInFlight(rows, now, 25)).toBe(true);
});

test('deriveBuildInFlight false for a stale building row', () => {
    const now = Date.parse('2026-08-19T12:00:00Z');
    const rows = [
        {
            state: 'building',
            started_at: '2026-08-19T11:20:00Z',
            created_at: '2026-08-19T11:20:00Z',
        },
    ];
    expect(deriveBuildInFlight(rows, now, 25)).toBe(false);
});

test('deriveBuildInFlight false when latest state is ready', () => {
    const now = Date.parse('2026-08-19T12:00:00Z');
    const rows = [
        {
            state: 'ready',
            started_at: '2026-08-19T11:59:00Z',
            created_at: '2026-08-19T11:59:00Z',
        },
    ];
    expect(deriveBuildInFlight(rows, now, 25)).toBe(false);
});

test('mapDeployNotification maps Netlify states', () => {
    expect(
        mapDeployNotification({ id: 'd1', state: 'building' }),
    ).toMatchObject({
        deploy_id: 'd1',
        state: 'building',
    });
    expect(mapDeployNotification({ id: 'd1', state: 'ready' })?.state).toBe(
        'ready',
    );
    expect(mapDeployNotification({ id: 'd1', state: 'error' })?.state).toBe(
        'error',
    );
    expect(mapDeployNotification({ id: 'd1', state: 'failed' })?.state).toBe(
        'error',
    );
    expect(mapDeployNotification({ state: 'building' })).toBeNull();
    expect(mapDeployNotification({ id: 'd1', state: 'weird' })).toBeNull();
});

test('mapDeployNotification ignores non-production contexts', () => {
    expect(
        mapDeployNotification({
            id: 'd1',
            state: 'ready',
            context: 'production',
        }),
    ).not.toBeNull();
    expect(
        mapDeployNotification({
            id: 'd1',
            state: 'ready',
            context: 'deploy-preview',
        }),
    ).toBeNull();
    expect(
        mapDeployNotification({
            id: 'd1',
            state: 'ready',
            context: 'branch-deploy',
        }),
    ).toBeNull();
    // Absent context is treated as production.
    expect(mapDeployNotification({ id: 'd1', state: 'ready' })).not.toBeNull();
});

test('mapDeployNotification sets started_at only when building, finished_at otherwise', () => {
    const building = mapDeployNotification({ id: 'd1', state: 'building' })!;
    expect(building.started_at).not.toBeNull();
    expect(building.finished_at).toBeNull();
    const ready = mapDeployNotification({ id: 'd1', state: 'ready' })!;
    expect(ready.started_at).toBeNull();
    expect(ready.finished_at).not.toBeNull();
});
