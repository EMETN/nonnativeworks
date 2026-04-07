// ---------------------------------------------------------------------------
// Category keyword map
// Matched against lowercased job title (primary) and description (fallback).
// ---------------------------------------------------------------------------

// Pre-compiled word-boundary regexes for each keyword, built at module load.
// Using \b ensures "head of product" doesn't match "head of production".
// Special non-word characters (/, &) inside keywords are escaped but not treated
// as boundary positions — the outer \b anchors at the true word edges.
const CATEGORY_KEYWORD_PATTERNS: Record<string, Array<{ pattern: RegExp; keyword: string }>> = {};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  engineering: [
    'engineer', 'engineering', 'developer', 'developers', 'programmer', 'devops',
    'frontend', 'front-end', 'backend', 'back-end', 'fullstack', 'full-stack',
    'full stack', 'software', 'architect', 'infrastructure',
    'mobile', 'ios', 'android', 'embedded', 'firmware', 'hardware',
    'cloud', 'security engineer', 'cybersecurity', 'network engineer',
    'systems engineer', 'qa engineer', 'quality assurance', 'tester',
    'database administrator', 'dba', 'it support', 'it engineer', 'architecture',
    'information technology', 'staff engineer', 'principal engineer',
    'release engineer', 'game developer', 'solutions architect', 'testing', 'ict',
    'development skills', 'guidewire', 
  ],
  'data-analytics': [
    'data scientist', 'data science', 'data engineer', 'data analyst', 
    'data analysis', 'data analytics', 'ai', 'ml', 'ai/ml',
    'machine learning', 'ml engineer', 'ai engineer', 'artificial intelligence',
    'analytics engineer', 'business intelligence', 'bi analyst', 'bi developer',
    'data warehouse', 'big data', 'statistician', 'quantitative', 'quantitative analyst',
    'research scientist', 'mlops', 'risk modeling', 'differential privacy',
  ],
  product: [
    'product manager', 'product owner', 'product director', 'head of product',
    'vp of product', 'vp product', 'chief product officer', 'product lead',
    'product analyst', 'product strategist', 
  ],
  design: [
    'designer', 'ux', 'ux designer', 'ui designer', 'user experience',
    'user interface', 'product designer', 'graphic designer', 'visual designer',
    'creative director', 'art director', 'brand designer', 'motion designer',
    'illustrator', 'design lead',
  ],
  marketing: [
    'marketing', 'content strategist', 'content writer',
    'social media', 'brand', 'growth hacker', 'growth marketer', 'brand manager',
    'campaign', 'copywriter', 'copywriting', 'digital marketing',
    'performance marketing', 'email marketing', 'demand generation',
    'product marketing', 'public relations', 'communication',
    'communications manager', 'communications director', 'cmo',
  ],
  sales: [
    'sales', 'sales manager', 'account executive', 'account manager', 'account management',
    'business development', 'bdm', 'bdr', 'sdr', 'revenue', 'partnership manager',
    'partner manager', 'commercial manager', 'field sales',
    'enterprise sales', 'sales development', 'head of sales', 'vp sales',
    'chief revenue', 'cro',
  ],
  'customer-success': [
    'customer success', 'success manager', 'customer experience',
    'client success', 'customer onboarding', 'account health',
    'client partner', 'retention',
  ],
  'customer-support': [
    'customer support', 'customer service', 'support engineer',
    'helpdesk', 'help desk', 'service desk', 'call center', 'technical support',
    'client support', 'customer care', 'support specialist',
    'support agent', 'support representative',
  ],
  operations: [
    'operations', 'operations manager', 'operations director', 'head of operations',
    'supply chain', 'logistics', 'procurement', 'facilities', 'head of production',
    'office manager', 'executive assistant', 'program manager',
    'project manager', 'pmo', 'coo', 'process manager', 'manufacturing',
    'business operations', 'revenue operations', 'revenue ops', 'revops', 
    'business strategy', 'program management', 'portfolio management', 
    'governance', 'change management', 'transformation', 'assembly', 'assembler',
    'logistics', 'technician', 'inventory', 'shipping', 'distribution', 'operator',
    'grocery associate', 'grocery shift lead', 'doctor',
  ],
  'finance-accounting': [
    'finance', 'financial', 'accountant', 'accounting', 'controller',
    'cfo', 'chief financial', 'treasury', 'audit', 'auditor', 'tax',
    'bookkeeper', 'fp&a', 'financial analyst', 'investor relations',
    'billing', 'risk analyst', 'risk management',
    'corporate finance', 'valuation', 'credit analyst', 'fraud analyst',
  ],
  'hr-recruiting': [
    'hr', 'recruiter', 'recruitment', 'talent acquisition', 'talent management',
    'talent partner', 'people operations', 'people partner', 'hrbp', 
    'hr business partner', 'hr manager', 'hr director', 'chief people', 'payroll',
    'compensation', 'learning and development', 'l&d',
    'organisational development', 'organizational development', 'p&o', 'p & o',
    'people & organization',
  ],
  legal: [
    'legal', 'counsel', 'lawyer', 'attorney', 'compliance',
    'regulatory', 'gdpr', 'paralegal', 'intellectual property',
    'general counsel', 'chief legal',
  ],
};

// Titles that should always classify as 'other' regardless of description content.
// These are catch-all or non-specific postings where description keywords would mislead.
const OTHER_TITLE_PATTERNS: RegExp[] = [
  /\bopen\s+application\b/i,
  /\bspontaneous\s+application\b/i,
  /\bspeculative\s+application\b/i,
  /\bgeneral\s+application\b/i,
];

// Build the regex map once at module load.
for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
  CATEGORY_KEYWORD_PATTERNS[category] = keywords.map(kw => ({
    keyword: kw.trim(),
    pattern: new RegExp(`\\b${kw.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  }));
}

/**
 * Classifies a job into one of the defined categories based on keyword matching.
 * jobFunction (structured API field) is scored first (3 pts per match);
 * title is scored next (2 pts per match); description is a fallback (1 pt per match).
 * Returns the category plus the keyword that triggered it and the source.
 */
export function classifyCategoryVerbose(
  title: string,
  descriptionText?: string,
  jobFunction?: string,
): { category: string; matchedKeyword?: string; source: 'title' | 'description' | 'jobFunction' | 'default' } {
  let best = 'other';
  let bestScore = 0;
  let bestMatchPos = Infinity; // tiebreaker: earlier position = higher emphasis in text
  let bestKeyword: string | undefined;
  let bestSource: 'title' | 'description' | 'jobFunction' | 'default' = 'default';

  // jobFunction — highest priority (3 pts): a structured API field like "Internal communication"
  if (jobFunction) {
    for (const [category, patterns] of Object.entries(CATEGORY_KEYWORD_PATTERNS)) {
      let score = 0;
      let firstMatch: string | undefined;
      let earliestPos = Infinity;
      for (const { pattern, keyword } of patterns) {
        const m = pattern.exec(jobFunction);
        if (m) {
          score += 3;
          if (!firstMatch) firstMatch = keyword;
          if (m.index < earliestPos) earliestPos = m.index;
        }
      }
      if (score > bestScore || (score === bestScore && earliestPos < bestMatchPos)) {
        bestScore = score;
        bestMatchPos = earliestPos;
        best = category;
        bestKeyword = firstMatch;
        bestSource = 'jobFunction';
      }
    }
    // jobFunction is a structured field set by the company — trust it when it matches.
    // Only fall through to title/description when jobFunction didn't match any keyword.
    if (bestScore > 0) return { category: best, matchedKeyword: bestKeyword, source: 'jobFunction' };
  }

  // Title — medium priority (2 pts)
  for (const [category, patterns] of Object.entries(CATEGORY_KEYWORD_PATTERNS)) {
    let score = 0;
    let firstMatch: string | undefined;
    let earliestPos = Infinity;
    for (const { pattern, keyword } of patterns) {
      const m = pattern.exec(title);
      if (m) {
        score += 2;
        if (!firstMatch) firstMatch = keyword;
        if (m.index < earliestPos) earliestPos = m.index;
      }
    }
    if (score > bestScore || (score === bestScore && earliestPos < bestMatchPos)) {
      bestScore = score;
      bestMatchPos = earliestPos;
      best = category;
      bestKeyword = firstMatch;
      bestSource = 'title';
    }
  }

  if (bestScore > 0) return { category: best, matchedKeyword: bestKeyword, source: bestSource };

  // If the title signals a non-specific posting, don't let description keywords mislead.
  if (OTHER_TITLE_PATTERNS.some(p => p.test(title))) {
    return { category: 'other', source: 'default' };
  }

  // Fallback: scan description text
  if (descriptionText) {
    for (const [category, patterns] of Object.entries(CATEGORY_KEYWORD_PATTERNS)) {
      let score = 0;
      let firstMatch: string | undefined;
      let earliestPos = Infinity;
      for (const { pattern, keyword } of patterns) {
        const m = pattern.exec(descriptionText);
        if (m) {
          score++;
          if (!firstMatch) firstMatch = keyword;
          if (m.index < earliestPos) earliestPos = m.index;
        }
      }
      if (score > bestScore || (score === bestScore && earliestPos < bestMatchPos)) {
        bestScore = score;
        bestMatchPos = earliestPos;
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
