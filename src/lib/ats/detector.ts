import type { AtsDetectionResult } from './types';

/**
 * Companies whose career page hostname differs from their ATS board slug.
 * Key: lowercase hostname of the company's own career page (no www).
 * Value: the slug used on the ATS platform.
 */
const HOSTNAME_SLUG_OVERRIDES: Record<string, { ats: AtsDetectionResult['ats']; slug: string }> = {
  'ouraring.com': { ats: 'greenhouse', slug: 'oura' },
  'alpha-sense.com': { ats: 'greenhouse', slug: 'alphasense' },
  'deptagency.com': { ats: 'greenhouse', slug: 'dept' },
};

export function detectAts(url: string): AtsDetectionResult {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsed.pathname;

    // Hostname override — e.g. ouraring.com → Greenhouse slug "oura"
    if (hostname in HOSTNAME_SLUG_OVERRIDES) {
      const { ats, slug } = HOSTNAME_SLUG_OVERRIDES[hostname];
      return { ats, companySlug: slug };
    }

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
    // Pattern: jobs.lever.co/{slug} or jobs.eu.lever.co/{slug}
    if (hostname === 'jobs.lever.co' || hostname === 'jobs.eu.lever.co') {
      const match = pathname.match(/^\/([^/]+)/);
      if (match) return { ats: 'lever', companySlug: match[1], leverEu: hostname === 'jobs.eu.lever.co' };
    }

    // Ashby
    // Pattern: jobs.ashbyhq.com/{slug}
    if (hostname === 'jobs.ashbyhq.com') {
      const match = pathname.match(/^\/([^/]+)/);
      if (match) return { ats: 'ashby', companySlug: match[1] };
    }

    // Workable
    // Patterns:
    // apply.workable.com/{slug}
    // apply.workable.com/{slug}/jobs
    // apply.workable.com/api/v1/widget/accounts/{slug}
    // {slug}.workable.com
    if (hostname === 'apply.workable.com') {
      // API pattern
      const apiMatch = pathname.match(/^\/api\/v1\/widget\/accounts\/([^/]+)/);
      if (apiMatch) {
        return { ats: 'workable', companySlug: apiMatch[1] };
      }

      // Standard UI pattern
      const match = pathname.match(/^\/([^/]+)/);
      if (match && match[1] !== 'api') {
        return { ats: 'workable', companySlug: match[1] };
      }
    }

    // Workable subdomain pattern: {slug}.workable.com
    if (hostname.endsWith('.workable.com')) {
      const slug = hostname.replace(/\.workable\.com$/, '');
      if (slug) return { ats: 'workable', companySlug: slug };
    }

    // Recruitee
    // Pattern: {slug}.recruitee.com
    if (hostname.endsWith('.recruitee.com')) {
      const slug = hostname.replace(/\.recruitee\.com$/, '');
      if (slug) return { ats: 'recruitee', companySlug: slug };
    }

    // Workday (myworkdayjobs.com)
    // Pattern: {company}.wd{N}.myworkdayjobs.com/{locale}/{site}
    if (hostname.endsWith('.myworkdayjobs.com')) {
      const company = hostname.split('.')[0];
      if (company) return { ats: 'workday', companySlug: company };
    }

    // Workday (myworkdaysite.com)
    // Pattern: wd{N}.myworkdaysite.com/{locale}/recruiting/{company}/{site}
    if (hostname.endsWith('.myworkdaysite.com')) {
      try {
        const pathMatch = new URL(url).pathname.match(/\/(?:[a-z]{2}-[A-Z]{2}\/)?recruiting\/([^/]+)/);
        const slug = pathMatch?.[1] ?? hostname.split('.')[0];
        if (slug) return { ats: 'workday', companySlug: slug };
      } catch {
        const slug = hostname.split('.')[0];
        if (slug) return { ats: 'workday', companySlug: slug };
      }
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
    case 'workable': return 'Workable';
    case 'workday': return 'Workday';
    case 'recruitee': return 'Recruitee';
    case 'company-api': return 'Company API';
    case 'python': return 'Page scraper';
    default: return 'Unknown';
  }
}
