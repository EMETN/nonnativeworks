/**
 * classify.ts — converts raw Python scraper output to upload-ready JSON.
 *
 * Usage:
 *   python3 main.py <url> | pnpm exec jiti scraper/classify.ts --company "CGI" --career-url "https://..."
 *
 * Or from a saved file:
 *   pnpm exec jiti scraper/classify.ts --company "CGI" --career-url "https://..." < raw.json
 */

import { classifyJobVerbose } from '../src/lib/classifier';
import { countryNameToSlug } from '../src/lib/country-flags';
import { logScrapeRun, type PositionLogEntry } from '../src/lib/scrape-logger';

// ISO alpha-2 → [full name, slug]
const COUNTRY_NAMES: Record<string, string> = {
  FI: 'Finland',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  NL: 'Netherlands',
  DE: 'Germany',
  EE: 'Estonia',
  LV: 'Latvia',
  LT: 'Lithuania',
};

interface RawJob {
  title: string;
  url?: string;
  location?: string;
  country_code?: string;
}

// Parse CLI args
const args = process.argv.slice(2);
const get = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

const companyName = get('--company');
const careerUrl = get('--career-url');

if (!companyName || !careerUrl) {
  console.error('Usage: classify.ts --company "CGI" --career-url "https://..."');
  process.exit(1);
}

// Read stdin
let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

const rawJobs: RawJob[] = JSON.parse(input);

// Group by country_code
const byCountry = new Map<string, RawJob[]>();
for (const job of rawJobs) {
  const cc = job.country_code?.toUpperCase() ?? 'UNKNOWN';
  if (!byCountry.has(cc)) byCountry.set(cc, []);
  byCountry.get(cc)!.push(job);
}

// Build upload entries per country
const entries = [];
const positionLogs: PositionLogEntry[] = [];
let skippedUnknown = 0;

for (const [cc, jobs] of byCountry) {
  const countryName = COUNTRY_NAMES[cc];
  if (!countryName) {
    process.stderr.write(`Skipping unknown country code: ${cc}\n`);
    skippedUnknown += jobs.length;
    continue;
  }

  const positions = jobs.map((job) => {
    const { classified, signals } = classifyJobVerbose(
      { title: job.title, url: job.url },
      cc,
    );

    positionLogs.push({
      title: classified.title,
      category: classified.category,
      categorySignal: signals.categorySignal,
      categorySource: signals.categorySource,
      requires_native_language: classified.requires_native_language,
      local_language_advantage: classified.local_language_advantage,
      requiredLanguages: classified.requiredLanguages,
      preferredLanguages: classified.preferredLanguages,
      languageSignals: signals.languageSignals,
      countryCode: cc,
      countryName,
    });

    return {
      country_code: cc,
      title: classified.title,
      url: classified.url,
      city: job.location ?? undefined,
      requires_native_language: classified.requires_native_language,
      local_language_advantage: classified.local_language_advantage,
      required_languages: classified.requiredLanguages,
      preferred_languages: classified.preferredLanguages,
      category: classified.category,
    };
  });

  entries.push({
    company_name: companyName,
    country: countryNameToSlug(countryName),
    country_name: countryName,
    country_code: cc,
    career_page_url: careerUrl,
    is_english_company: false,
    positions,
  });
}

logScrapeRun({
  companyName,
  careerUrl,
  ats: 'python',
  positions: positionLogs,
  skippedUnknownLocation: 0,
  skippedUntrackedCountry: skippedUnknown,
  alsoToStderr: true,
});

console.log(JSON.stringify({ total_positions: rawJobs.length, companies: entries }, null, 2));
