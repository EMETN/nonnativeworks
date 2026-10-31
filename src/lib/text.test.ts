import { test, expect } from 'vitest';
import { foldText, formatCount } from './text';

test('lowercases', () => {
    expect(foldText('Wärtsilä')).toBe('wartsila');
});

test('strips diacritics so accented names match ASCII queries', () => {
    expect(foldText('Malmö').includes(foldText('malmo'))).toBe(true);
    expect(foldText('Zürich').includes(foldText('zur'))).toBe(true);
    expect(foldText('São Paulo').includes(foldText('sao'))).toBe(true);
});

test('leaves plain ASCII unchanged', () => {
    expect(foldText('Helsinki')).toBe('helsinki');
});

test('formatCount groups thousands with dots, including four-digit numbers', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1624)).toBe('1.624');
    expect(formatCount(22873)).toBe('22.873');
    expect(formatCount(1234567)).toBe('1.234.567');
});
