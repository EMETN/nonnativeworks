import { test, expect } from 'vitest';
import { foldText } from './text';

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
