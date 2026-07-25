// Client-only sessionStorage cache for admin data, so navigating between admin
// pages doesn't refetch (and re-hit Supabase) when nothing changed. Entries expire
// after TTL_MS as a safety net for server-side changes (the scheduled scrape) the
// client can't observe; UI mutations invalidate explicitly. Never touches the
// network or any shared cache — it only holds data the operator already fetched.

const TTL_MS = 5 * 60 * 1000;
const PREFIX = 'admin:';

interface Entry<T> {
    data: T;
    ts: number;
}

export function readCache<T>(key: string): T | null {
    try {
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
