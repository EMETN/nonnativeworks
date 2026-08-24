import { test, expect } from 'vitest';
import { groupBy } from './build-queries';

test('groupBy collects rows under their key', () => {
    const rows = [
        { id: 'a', company_id: '1' },
        { id: 'b', company_id: '2' },
        { id: 'c', company_id: '1' },
    ];

    const grouped = groupBy(rows, (row) => row.company_id);

    expect(grouped.get('1')).toEqual([
        { id: 'a', company_id: '1' },
        { id: 'c', company_id: '1' },
    ]);
});

test('groupBy preserves row order within a group', () => {
    const rows = [
        { id: 'a', company_id: '1' },
        { id: 'b', company_id: '2' },
        { id: 'c', company_id: '1' },
    ];

    const grouped = groupBy(rows, (row) => row.company_id);

    expect(grouped.get('1')?.map((r) => r.id)).toEqual(['a', 'c']);
    expect(grouped.get('2')?.map((r) => r.id)).toEqual(['b']);
});

test('groupBy returns an empty map for no rows', () => {
    expect(groupBy([], (row: { id: string }) => row.id).size).toBe(0);
});

test('groupBy omits keys that never appear', () => {
    const grouped = groupBy(
        [{ id: 'a', company_id: '1' }],
        (r) => r.company_id,
    );

    expect(grouped.has('2')).toBe(false);
});
