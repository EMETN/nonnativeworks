// Saves admin pages refetching on every navigation. TTL_MS covers server-side changes the
// client can't see (the scheduled scrape); UI mutations invalidate explicitly.

const TTL_MS = 5 * 60 * 1000;
const PREFIX = 'admin:';

interface Entry<T> {
    data: T;
    ts: number;
}

const EPOCH_KEY = PREFIX + 'epoch';

function dropCacheOnNewEpoch(): void {
    const epoch = document.documentElement.dataset.localDataEpoch;
    if (!epoch || sessionStorage.getItem(EPOCH_KEY) === epoch) return;
    invalidateCachePrefix('');
    sessionStorage.setItem(EPOCH_KEY, epoch);
}

export function readCache<T>(key: string): T | null {
    try {
        dropCacheOnNewEpoch();
        const raw = sessionStorage.getItem(PREFIX + key);
        if (!raw) return null;
        const entry = JSON.parse(raw) as Entry<T>;
        if (Date.now() - entry.ts > TTL_MS) {
            sessionStorage.removeItem(PREFIX + key);
            return null;
        }
        return entry.data;
    } catch {
        return null;
    }
}

export function writeCache<T>(key: string, data: T): void {
    try {
        dropCacheOnNewEpoch();
        sessionStorage.setItem(
            PREFIX + key,
            JSON.stringify({ data, ts: Date.now() }),
        );
    } catch {
        // best-effort: unavailable storage or quota exceeded just means no caching
    }
}

export function invalidateCache(...keys: string[]): void {
    try {
        for (const k of keys) sessionStorage.removeItem(PREFIX + k);
    } catch {}
}

export function invalidateCachePrefix(subPrefix: string): void {
    try {
        const full = PREFIX + subPrefix;
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const k = sessionStorage.key(i);
            if (k && k.startsWith(full)) sessionStorage.removeItem(k);
        }
    } catch {}
}
