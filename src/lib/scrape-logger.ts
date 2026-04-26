import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { SignalEntry } from './classifiers/language';

export interface PositionLogEntry {
  title: string;
  category: string;
  categorySignal?: string;
  categorySource: 'title' | 'description' | 'jobFunction' | 'default';
  requires_native_language: boolean;
  local_language_advantage: boolean;
  requiredLanguages: string[];
  preferredLanguages: string[];
  languageSignals: SignalEntry[];
  countryCode: string;
  countryName: string;
  city?: string[];
  work_model?: 'remote' | 'hybrid' | 'on-site';
  skills?: string[];
  required_education?: string;
}

const logsDir = join(process.cwd(), 'logs');

function getLogPath(): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return join(logsDir, `${date}.log`);
}

function formatLanguageSignal(pos: PositionLogEntry): string {
  const sig = pos.languageSignals[0];
  if (!sig || sig.phase === '2d-none') return 'no language signal';
  const m = sig.matched ? ` "${sig.matched.slice(0, 60)}"` : '';
  switch (sig.phase) {
    case '1a': return `1a: non-ASCII title${m}`;
    case '1b': return `1b: advantage phrase${m}`;
    case '1b-chars': return `1b-chars: ${sig.description}${m}`;
    case '1c': return `1c: tinyld${m}`;
    case '2a': return `2a: ${sig.description}${m}`;
    case '2a-nordic': return `2a-nordic: ${sig.description}${m}`;
    case '2a-cross': return `2a-cross: ${sig.description}${m}`;
    case '2b': return `2b: location-conditional${m}`;
    case '2c': return `2c: English-only${m}`;
    default: return sig.description + m;
  }
}

function formatCategory(pos: PositionLogEntry): string {
  const ABBREV: Record<string, string> = {
    'customer-success': 'cust-success',
    'customer-support': 'cust-support',
    'finance-accounting': 'finance',
    'hr-recruiting': 'hr',
    'data-analytics': 'data',
  };
  const cat = ABBREV[pos.category] ?? pos.category;
  const sourceSuffix = pos.categorySource === 'description' ? '/desc'
    : pos.categorySource === 'jobFunction' ? '/api'
    : '';
  if (!pos.categorySignal) return `[${cat}]`;
  const kw = pos.categorySignal.slice(0, 20);
  return `[${cat}${sourceSuffix}:"${kw}"]`;
}

export function logScrapeRun(params: {
  companyName: string;
  careerUrl: string;
  ats: string | null;
  positions: PositionLogEntry[];
  skippedUnknownLocation: number;
  skippedUnknownLocationJobs?: Array<{ title: string; location: string }>;
  skippedUntrackedCountry: number;
  outcomeCacheHits?: number;
  outcomeCacheTotal?: number;
  error?: string;
  alsoToStderr?: boolean;
}): void {
  const lines: string[] = [];
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const sep = '='.repeat(80);
  const sub = '─'.repeat(76);

  lines.push(sep);
  lines.push(`SCRAPE  ${timestamp}  ${params.companyName}  (${params.ats ?? 'unknown'})`);
  lines.push(`URL     ${params.careerUrl}`);
  if (params.outcomeCacheTotal !== undefined && params.outcomeCacheTotal > 0) {
    const hits = params.outcomeCacheHits ?? 0;
    const misses = params.outcomeCacheTotal - hits;
    lines.push(`CACHE   ${hits} hits  ${misses} misses  (${params.outcomeCacheTotal} total)`);
  }
  lines.push(sep);
  lines.push('');

  // Group positions by country, preserving insertion order
  const byCountry = new Map<string, { name: string; positions: PositionLogEntry[] }>();
  for (const pos of params.positions) {
    if (!byCountry.has(pos.countryCode)) {
      byCountry.set(pos.countryCode, { name: pos.countryName, positions: [] });
    }
    byCountry.get(pos.countryCode)!.positions.push(pos);
  }

  if (byCountry.size === 0 && !params.error) {
    lines.push('  (no tracked positions)');
    lines.push('');
  }

  for (const [code, { name, positions }] of byCountry) {
    const count = positions.length;
    lines.push(`  ${name.toUpperCase()} (${code})  —  ${count} position${count !== 1 ? 's' : ''}`);
    lines.push(`  ${sub}`);
    for (const pos of positions) {
      const icon = pos.requires_native_language ? '✗' : pos.local_language_advantage ? '~' : '✓';
      const titleStr = (pos.title ?? '').slice(0, 42).padEnd(44);
      const catStr = formatCategory(pos);
      const langStr = formatLanguageSignal(pos);
      lines.push(`  ${icon}  ${titleStr}${catStr}  ${langStr}`);
      const locationParts: string[] = [];
      if (pos.work_model) locationParts.push(pos.work_model);
      if (pos.city && pos.city.length > 0) locationParts.push(pos.city.join(', '));
      if (locationParts.length > 0) {
        lines.push(`       ${locationParts.join(' · ')}`);
      }
      const metaParts: string[] = [];
      if (pos.required_education) metaParts.push(`edu:${pos.required_education}`);
      if (pos.skills && pos.skills.length > 0) metaParts.push(pos.skills.join(', '));
      if (metaParts.length > 0) {
        lines.push(`       ${metaParts.join('  ·  ')}`);
      }
    }
    lines.push('');
  }

  const skippedParts: string[] = [];
  if (params.skippedUnknownLocation > 0) skippedParts.push(`${params.skippedUnknownLocation} unknown location`);
  if (params.skippedUntrackedCountry > 0) skippedParts.push(`${params.skippedUntrackedCountry} untracked country`);
  if (skippedParts.length > 0) {
    lines.push(`  SKIPPED  ${skippedParts.join('  ·  ')}`);
    if (params.skippedUnknownLocationJobs?.length) {
      for (const j of params.skippedUnknownLocationJobs) {
        const titleStr = (j.title ?? '').slice(0, 44).padEnd(46);
        const locStr = j.location ? `"${j.location}"` : '(no location)';
        lines.push(`  ?  ${titleStr}${locStr}`);
      }
    }
    lines.push('');
  }

  if (params.error) {
    lines.push(`  ERROR  ${params.error}`);
    lines.push('');
  }

  const output = lines.join('\n') + '\n';

  try {
    mkdirSync(logsDir, { recursive: true });
    appendFileSync(getLogPath(), output);
  } catch {
    // never let logging break the scrape
  }

  if (params.alsoToStderr) {
    process.stderr.write(output);
  }
}
