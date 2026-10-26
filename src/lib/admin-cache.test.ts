import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readCache, writeCache } from './admin-cache';

function fakeSessionStorage() {
    const map = new Map<string, string>();
    return {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, v),
        removeItem: (k: string) => void map.delete(k),
        key: (i: number) => [...map.keys()][i] ?? null,
        get length() {
            return map.size;
        },
    };
}

function loadPageWithEpoch(epoch?: string) {
    vi.stubGlobal('document', {
        documentElement: { dataset: { localDataEpoch: epoch } },
    });
}

beforeEach(() => {
    vi.stubGlobal('sessionStorage', fakeSessionStorage());
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('admin cache local data epoch', () => {
    test('keeps entries while the epoch is unchanged', () => {
        loadPageWithEpoch('1');
        writeCache('companies', ['a']);
        loadPageWithEpoch('1');
        expect(readCache('companies')).toEqual(['a']);
    });

    test('drops entries written before a new epoch', () => {
        loadPageWithEpoch('1');
        writeCache('companies', ['a']);
        writeCache('positions:x', ['b']);
        loadPageWithEpoch('2');
        expect(readCache('companies')).toBeNull();
        expect(readCache('positions:x')).toBeNull();
    });

    test('keeps entries when the page has no epoch', () => {
        loadPageWithEpoch(undefined);
        writeCache('companies', ['a']);
        expect(readCache('companies')).toEqual(['a']);
    });
});
