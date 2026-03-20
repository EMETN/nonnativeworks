import type { AtsDetectionResult } from './types';

export function detectAts(url: string): AtsDetectionResult {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    // Greenhouse
    // Patterns: boards.greenhouse.io/{slug}, job-boards.greenhouse.io/{slug}
    //           embed: ?for={slug} or #for={slug}
    if (hostname === 'boards.greenhouse.io' || hostname === 'job-boards.greenhouse.io') {
      const forParam = parsed.searchParams.get('for');
      if (forParam) return { ats: 'greenhouse', companySlug: forParam };
      const match = pathname.match(/^\/([^/]+)/);
      if (match && match[1] !== 'embed') return { ats: 'greenhouse', companySlug: match[1] };
    }

    // Lever
    // Pattern: jobs.lever.co/{slug} or jobs.lever.co/{slug}/{uuid}
    if (hostname === 'jobs.lever.co') {
      const match = pathname.match(/^\/([^/]+)/);
      if (match) return { ats: 'lever', companySlug: match[1] };
    }

    // Ashby
    // Pattern: jobs.ashbyhq.com/{slug}
    if (hostname === 'jobs.ashbyhq.com') {
      const match = pathname.match(/^\/([^/]+)/);
      if (match) return { ats: 'ashby', companySlug: match[1] };
    }

    return { ats: null, companySlug: extractCompanySlug(hostname) };
  } catch {
    return { ats: null, companySlug: null };
  }
}

const STRIP_SUBDOMAINS = new Set(['www', 'careers', 'jobs', 'work', 'hire', 'talent', 'apply']);

function extractCompanySlug(hostname: string): string | null {
  const parts = hostname.split('.');
  // Strip leading subdomains that are career-related or www
  let start = 0;
  while (start < parts.length - 2 && STRIP_SUBDOMAINS.has(parts[start])) {
    start++;
  }
  const remaining = parts.slice(start);
  // Need at least [name, tld]
  if (remaining.length < 2) return null;
  return remaining[remaining.length - 2];
}

/** Human-readable label for display in the admin UI. */
export function atsLabel(ats: string | null): string {
  switch (ats) {
    case 'greenhouse': return 'Greenhouse';
    case 'lever': return 'Lever';
    case 'ashby': return 'Ashby';
    case 'python': return 'Page scraper';
    default: return 'Unknown';
  }
}
