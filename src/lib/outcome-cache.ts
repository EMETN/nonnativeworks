import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { createHash } from 'crypto';
import type { SignalEntry } from './classifiers/language';

export const CLASSIFIER_VERSION = 1;

const TTL_DAYS = 14;

export interface CachedOutcome {
    category: string;
    categorySignal?: string;
    categorySource: 'title' | 'description' | 'jobFunction' | 'default';
    requires_native_language: boolean;
    local_language_advantage: boolean;
    requiredLanguages: string[];
    preferredLanguages: string[];
    languageSignals: SignalEntry[];
    skills: string[];
    required_education?: string;
    titleHash: string;
    countryCode: string;
    classifierVersion: number;
    cachedAt: string;
}

type Store = Record<string, CachedOutcome>;

let _store: Store = {};
let _dirty = false;
let _loadedPath: string | null = null;

export function titleHash(title: string): string {
    return createHash('md5').update(title).digest('hex').slice(0, 8);
}

function cacheKey(url: string, countryCode: string): string {
    return `${url}|${countryCode}`;
}

/**
 * Load the cache from disk once per process. Scrapes run concurrently, so a
 * per-request reload would replace the shared in-memory store and drop other
 * scrapes' unflushed entries.
 */
export function load(path: string): void {
    if (_loadedPath === path) return;
    _store = {};
    _dirty = false;
    _loadedPath = path;
    try {
        const raw = readFileSync(path, 'utf-8');
        _store = JSON.parse(raw) as Store;
        console.log(
            `[outcome-cache] loaded ${Object.keys(_store).length} entries`,
        );
    } catch {
        console.log('[outcome-cache] no existing cache found, starting fresh');
    }
}

export function get(
    url: string,
    countryCode: string,
    currentTitleHash: string,
): CachedOutcome | null {
    if (_loadedPath === null) return null;
    const key = cacheKey(url, countryCode);
    const entry = _store[key];
    if (!entry) return null;

    const age = Date.now() - new Date(entry.cachedAt).getTime();
    if (age > TTL_DAYS * 86_400_000) {
        delete _store[key];
        _dirty = true;
        return null;
    }

    if (entry.classifierVersion !== CLASSIFIER_VERSION) {
        delete _store[key];
        _dirty = true;
        return null;
    }

    if (entry.titleHash !== currentTitleHash) {
        delete _store[key];
        _dirty = true;
        return null;
    }

    return entry;
}

export function set(
    url: string,
    countryCode: string,
    outcome: CachedOutcome,
): void {
    _store[cacheKey(url, countryCode)] = outcome;
    _dirty = true;
}

/** Returns the set of job URLs that have at least one valid (non-expired, current-version) cached outcome. */
export function cachedUrls(): Set<string> {
    const urls = new Set<string>();
    const now = Date.now();
    for (const [key, entry] of Object.entries(_store)) {
        if (entry.classifierVersion !== CLASSIFIER_VERSION) continue;
        if (now - new Date(entry.cachedAt).getTime() > TTL_DAYS * 86_400_000)
            continue;
        const pipe = key.indexOf('|');
        if (pipe > 0) urls.add(key.slice(0, pipe));
    }
    return urls;
}

export function flush(path: string): void {
    if (!_dirty) return;
    try {
        mkdirSync(dirname(path), { recursive: true });
        // Write-then-rename so a crash or concurrent reader never sees a partial file.
        const tmp = `${path}.${process.pid}.tmp`;
        writeFileSync(tmp, JSON.stringify(_store));
        renameSync(tmp, path);
        console.log(
            `[outcome-cache] saved ${Object.keys(_store).length} entries`,
        );
        _dirty = false;
    } catch (err) {
        console.warn(`[outcome-cache] failed to save: ${err}`);
    }
}
