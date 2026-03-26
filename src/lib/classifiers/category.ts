// ---------------------------------------------------------------------------
// Category keyword map
// Matched against lowercased job title (primary) and description (fallback).
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  engineering: [
    'engineer', 'developer', 'programmer', 'devops', 'sre', 'reliability',
    'frontend', 'front-end', 'backend', 'back-end', 'fullstack', 'full-stack',
    'full stack', 'software', 'architect', 'infrastructure', 'platform',
    'mobile', 'ios', 'android', 'embedded', 'firmware', 'hardware',
    'data scientist', 'data engineer', 'machine learning', 'ml engineer',
    'cloud', 'security engineer', 'cybersecurity', 'network engineer',
    'systems engineer', 'qa engineer', 'quality assurance', 'tester',
    'database administrator', 'dba', 'analytics engineer', 'it support',
    'it engineer', 'information technology',
  ],
  marketing: [
    'marketing', 'seo', 'sem', 'content strategist', 'content writer',
    'social media', 'brand', 'growth hacker', 'growth marketer',
    'campaign', 'copywriter', 'copywriting', 'digital marketing',
    'performance marketing', 'email marketing', 'demand generation',
    'product marketing', 'public relations', ' pr ', 'communications manager',
    'communications director', 'cmo',
  ],
  sales: [
    'sales', 'account executive', 'account manager', 'business development',
    'bdm', 'bdr', 'sdr', 'revenue', 'partnership manager',
    'partner manager', 'commercial manager', 'field sales',
    'enterprise sales', 'sales development', 'head of sales', 'vp sales',
    'chief revenue', 'cro',
  ],
  hr: [
    'recruiter', 'recruitment', 'talent acquisition', 'talent partner',
    'people operations', 'people partner', 'hrbp', 'hr business partner',
    'hr manager', 'hr director', 'chief people', 'cpo', 'payroll',
    'compensation', 'learning and development', 'l&d', 'onboarding',
    'organisational development', 'organizational development',
  ],
  finance: [
    'finance', 'financial', 'accountant', 'accounting', 'controller',
    'cfo', 'chief financial', 'treasury', 'audit', 'auditor', 'tax',
    'bookkeeper', 'fp&a', 'financial analyst', 'investor relations',
    'billing', 'revenue operations',
  ],
  design: [
    'designer', ' ux ', 'ux designer', 'ui designer', 'user experience',
    'user interface', 'product designer', 'graphic designer', 'visual designer',
    'creative director', 'art director', 'brand designer', 'motion designer',
    'illustrator', 'design lead',
  ],
  operations: [
    'operations manager', 'operations director', 'head of operations',
    'supply chain', 'logistics', 'procurement', 'facilities',
    'office manager', 'executive assistant', 'program manager',
    'project manager', 'pmo', 'coo', 'process manager',
    'business operations', 'revenue ops', 'revops',
  ],
  'customer-support': [
    'customer support', 'customer service', 'customer success',
    'support engineer', 'helpdesk', 'help desk', 'service desk',
    'technical support', 'client support', 'customer experience',
    'success manager', 'customer care', 'support specialist',
    'support agent',
  ],
  legal: [
    'legal', 'counsel', 'lawyer', 'attorney', 'compliance',
    'regulatory', 'privacy', 'gdpr', 'paralegal', 'intellectual property',
    'general counsel', 'clo', 'chief legal',
  ],
};

/**
 * Classifies a job into one of the defined categories based on keyword matching.
 * Title is scored first (2 pts per match); if no title match, description is
 * scored as a fallback (1 pt per match).
 * Returns the category plus the keyword that triggered it and the source.
 */
export function classifyCategoryVerbose(
  title: string,
  descriptionText?: string,
): { category: string; matchedKeyword?: string; source: 'title' | 'description' | 'default' } {
  const titleLower = ` ${title.toLowerCase()} `;

  let best = 'other';
  let bestScore = 0;
  let bestKeyword: string | undefined;
  let bestSource: 'title' | 'description' | 'default' = 'default';

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    let firstMatch: string | undefined;
    for (const kw of keywords) {
      if (titleLower.includes(kw)) {
        score += 2;
        if (!firstMatch) firstMatch = kw.trim();
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = category;
      bestKeyword = firstMatch;
      bestSource = 'title';
    }
  }

  if (bestScore > 0) return { category: best, matchedKeyword: bestKeyword, source: bestSource };

  // Fallback: scan description text
  if (descriptionText) {
    const descLower = descriptionText.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      let score = 0;
      let firstMatch: string | undefined;
      for (const kw of keywords) {
        if (descLower.includes(kw)) {
          score++;
          if (!firstMatch) firstMatch = kw.trim();
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = category;
        bestKeyword = firstMatch;
        bestSource = 'description';
      }
    }
  }

  return { category: best, matchedKeyword: bestKeyword, source: bestSource };
}

/** Classifies a job into one of the defined categories. */
export function classifyCategory(title: string, descriptionText?: string): string {
  return classifyCategoryVerbose(title, descriptionText).category;
}
