import { test, expect } from 'vitest';
import { computeRanges, mapWithConcurrency } from './pagination';

test('computeRanges returns nothing for an empty table', () => {
    expect(computeRanges(0, 1000)).toEqual([]);
});

test('computeRanges uses inclusive bounds', () => {
    expect(computeRanges(1000, 1000)).toEqual([{ from: 0, to: 999 }]);
});

test('computeRanges clamps the final page to the real total', () => {
    expect(computeRanges(2500, 1000)).toEqual([
        { from: 0, to: 999 },
        { from: 1000, to: 1999 },
        { from: 2000, to: 2499 },
    ]);
});

test('computeRanges rejects a non-positive page size', () => {
    expect(() => computeRanges(10, 0)).toThrow(/pageSize/);
});

test('mapWithConcurrency preserves input order', async () => {
    const delays = [30, 5, 20, 1];

    const result = await mapWithConcurrency(delays, 2, async (ms, i) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return i;
    });

    expect(result).toEqual([0, 1, 2, 3]);
});

test('mapWithConcurrency never exceeds the limit', async () => {
    let active = 0;
    let peak = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
    });

    expect(peak).toBeLessThanOrEqual(3);
});

test('mapWithConcurrency handles an empty list', async () => {
    expect(await mapWithConcurrency([], 5, async () => 1)).toEqual([]);
});
