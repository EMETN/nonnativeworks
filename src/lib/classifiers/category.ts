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
    'cloud', 'security engineer', 'cybersecurity', 'network engineer',
    'systems engineer', 'qa engineer', 'quality assurance', 'tester',
    'database administrator', 'dba', 'it support', 'it engineer',
    'information technology', 'staff engineer', 'principal engineer',
    'release engineer', 'game developer', 'solutions architect',
  ],
  'data-analytics': [
    'data scientist', 'data science', 'data engineer', 'data analyst', 'data analysis',
    'machine learning', 'ml engineer', 'ai engineer', 'artificial intelligence',
    'analytics engineer', 'business intelligence', 'bi analyst', 'bi developer',
    'data warehouse', 'big data', 'statistician', 'quantitative', 'quantitative analyst',
    'research scientist', 'mlops', 'risk modeling', 
  ],
  product: [
    'product manager', 'product owner', 'product director', 'head of product',
    'vp of product', 'vp product', 'chief product officer', 'product lead',
    'product analyst', 'product strategist', 
  ],
  design: [
    'designer', ' ux ', 'ux designer', 'ui designer', 'user experience',
    'user interface', 'product designer', 'graphic designer', 'visual designer',
    'creative director', 'art director', 'brand designer', 'motion designer',
    'illustrator', 'design lead',
  ],
  marketing: [
    'marketing', 'seo', 'sem', 'content strategist', 'content writer',
    'social media', 'brand', 'growth hacker', 'growth marketer', 'brand manager',
    'campaign', 'copywriter', 'copywriting', 'digital marketing',
    'performance marketing', 'email marketing', 'demand generation',
    'product marketing', 'public relations', ' pr ', 'communications',
    'communications manager', 'communications director', 'cmo',
  ],
  sales: [
    'sales', 'sales manager', 'account executive', 'account manager',
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
    'operations manager', 'operations director', 'head of operations',
    'supply chain', 'logistics', 'procurement', 'facilities',
    'office manager', 'executive assistant', 'program manager',
    'project manager', 'pmo', 'coo', 'process manager',
    'business operations', 'revenue operations', 'revenue ops', 'revops', 
    'business strategy', 'program management', 'portfolio management', 
    'governance', 'change management', 'transformation', 
  ],
  'finance-accounting': [
    'finance', 'financial', 'accountant', 'accounting', 'controller',
    'cfo', 'chief financial', 'treasury', 'audit', 'auditor', 'tax',
    'bookkeeper', 'fp&a', 'financial analyst', 'investor relations',
    'billing', 'risk analyst', 'risk management',
    'corporate finance', 'valuation', 'credit analyst', 'fraud analyst',
  ],
  'hr-recruiting': [
    'recruiter', 'recruitment', 'talent acquisition', 'talent management',
    'talent partner', 'people operations', 'people partner', 'hrbp', 
    'hr business partner', 'hr manager', 'hr director', 'chief people', 'payroll',
    'compensation', 'learning and development', 'l&d', 'onboarding',
    'organisational development', 'organizational development',
  ],
  legal: [
    'legal', 'counsel', 'lawyer', 'attorney', 'compliance',
    'regulatory', 'privacy', 'gdpr', 'paralegal', 'intellectual property',
    'general counsel', 'clo', 'chief legal',
  ],
};

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
  let bestKeyword: string | undefined;
  let bestSource: 'title' | 'description' | 'jobFunction' | 'default' = 'default';

  // jobFunction — highest priority (3 pts): a structured API field like "Internal communication"
  if (jobFunction) {
    const jfLower = ` ${jobFunction.toLowerCase()} `;
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      let score = 0;
      let firstMatch: string | undefined;
      for (const kw of keywords) {
        if (jfLower.includes(kw)) {
          score += 3;
          if (!firstMatch) firstMatch = kw.trim();
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = category;
        bestKeyword = firstMatch;
        bestSource = 'jobFunction';
      }
    }
  }

  // Title — medium priority (2 pts)
  const titleLower = ` ${title.toLowerCase()} `;
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
