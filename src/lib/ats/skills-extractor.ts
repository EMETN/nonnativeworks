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
