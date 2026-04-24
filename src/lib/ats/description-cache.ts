import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const CACHE_PATH = join(process.cwd(), 'cache', 'descriptions.json');
const TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

interface CacheEntry {
  html: string;
  fetchedAt: string;
}

type CacheStore = Record<string, CacheEntry>;

let store: CacheStore = {};
let dirty = false;

try {
  const raw = readFileSync(CACHE_PATH, 'utf-8');
  store = JSON.parse(raw) as CacheStore;
  console.log(`[description-cache] loaded ${Object.keys(store).length} entries from ${CACHE_PATH}`);
} catch {
  // File doesn't exist yet — start empty
}

export function getCached(url: string): string | undefined {
  const entry = store[url];
  if (!entry) return undefined;
  if (Date.now() - new Date(entry.fetchedAt).getTime() > TTL_MS) {
    delete store[url];
    dirty = true;
    return undefined;
  }
  return entry.html;
}

export function setCached(url: string, html: string): void {
  store[url] = { html, fetchedAt: new Date().toISOString() };
  dirty = true;
}

export function flushCache(): void {
  if (!dirty) return;
  try {
    mkdirSync(join(process.cwd(), 'cache'), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(store));
    console.log(`[description-cache] saved ${Object.keys(store).length} entries`);
    dirty = false;
  } catch (err) {
    console.warn(`[description-cache] failed to save: ${err}`);
  }
}
