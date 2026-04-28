import { createSupabaseServiceClient } from '../supabase';

export interface SkillEntry {
  id: string;
  canonical_name: string;
  aliases: string[];
}

/**
 * Load all skills from the database.
 * Call once per scrape run and pass the result to extractSkills().
 * Returns an empty array if the skills table is empty or unreachable,
 * so skill extraction degrades gracefully rather than failing the scrape.
 */
export async function loadSkills(): Promise<SkillEntry[]> {
  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('skills')
      .select('id, canonical_name, aliases');

    if (error) {
      console.warn('[skills-extractor] Could not load skills:', error.message);
      return [];
    }
    return (data ?? []) as SkillEntry[];
  } catch (err) {
    console.warn('[skills-extractor] Unexpected error loading skills:', err);
    return [];
  }
}

/**
 * Build a regex pattern for a single term that requires non-alphanumeric
 * boundaries on both sides, so "python" won't match inside "cpython" or "python3".
 */
function buildPattern(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i');
}

const EDUCATION_LEVELS = ['vocational', 'bachelor', 'master', 'mba', 'phd'] as const;
export type EducationLevel = typeof EDUCATION_LEVELS[number];

const EDUCATION_PATTERNS: { level: EducationLevel; patterns: RegExp[] }[] = [
  {
    level: 'phd',
    patterns: [
      /\bph\.?d\.?\b/i,
      /\bdoctorate\b/i,
      /\bdoctoral degree\b/i,
      /\bdoctor of (philosophy|science|engineering)\b/i,
    ],
  },
  {
    level: 'mba',
    patterns: [
      /\bmba\b/i,
      /\bmaster of business administration\b/i,
    ],
  },
  {
    level: 'master',
    patterns: [
      /\bmaster(?:'?s(?: degree| of science| of arts| of engineering| of laws)?| degree| of science| of arts| of engineering| of laws)\b/i,
      /\bm\.?sc\.?\b/i,
      /\bm\.?s\.?\b/i,
      /\bm\.?a\.?\b/i,
      /\bpostgraduate degree\b/i,
      /\bgraduate degree\b/i,
    ],
  },
  {
    level: 'bachelor',
    patterns: [
      /\bbachelor'?s?(?: degree| of science| of arts| of engineering)?\b/i,
      /\bb\.?sc\.?\b/i,
      /\bb\.?s\.?\b/i,
      /\bb\.?a\.?\b/i,
      /\bundergraduate degree\b/i,
      /\buniversity degree\b/i,
      /\bcollege degree\b/i,
      /\ba degree in\b/i,
      /\bhigher education\b/i,
      /\bacademic degree\b/i,
    ],
  },
  {
    level: 'vocational',
    patterns: [
      /\bvocational(?: qualification| degree)?\b/i,
      /\bapprenticeship\b/i,
      /\btrade (school|qualification|certificate)\b/i,
      /\btechnical degree\b/i,
    ],
  },
];

/**
 * Extract the minimum required education level from a job description.
 *
 * When multiple levels are mentioned (e.g. "Bachelor's or Master's preferred"),
 * returns the lowest — that is the actual floor requirement.
 * Returns undefined when no education requirement is stated.
 */
export function extractEducationRequirement(descriptionText: string): EducationLevel | undefined {
  if (!descriptionText) return undefined;

  // Normalize smart/curly apostrophes to ASCII so patterns like master'?s match
  // regardless of whether the source used U+2019 (') or U+0027 (').
  const text = descriptionText.replace(/[\u2018\u2019\u201A\u201B]/g, "'");
  const found = new Set<EducationLevel>();

  for (const { level, patterns } of EDUCATION_PATTERNS) {
    if (patterns.some((re) => re.test(text))) {
      found.add(level);
    }
  }

  if (found.size === 0) return undefined;

  // Return the minimum level found (lowest index in EDUCATION_LEVELS)
  for (const level of EDUCATION_LEVELS) {
    if (found.has(level)) return level;
  }
}

/**
 * Extract canonical skill names from a job description.
 *
 * @param descriptionText - Plain-text job description (not HTML).
 * @param skills          - Skills list from loadSkills(). Pre-load once per scrape run.
 * @returns Deduplicated array of canonical skill names found in the text.
 */
export function extractSkills(descriptionText: string, skills: SkillEntry[]): string[] {
  if (!descriptionText || skills.length === 0) return [];

  const matched: string[] = [];

  for (const skill of skills) {
    if (skill.aliases.length === 0) continue;

    const found = skill.aliases.some((alias) => {
      try {
        return buildPattern(alias).test(descriptionText);
      } catch {
        // Malformed alias — skip it rather than crashing the scrape
        return false;
      }
    });

    if (found) {
      matched.push(skill.canonical_name);
    }
  }

  return matched;
}
