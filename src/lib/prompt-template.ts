const CATEGORIES = [
    { name: 'Engineering', slug: 'engineering' },
    { name: 'Marketing', slug: 'marketing' },
    { name: 'Sales', slug: 'sales' },
    { name: 'HR', slug: 'hr' },
    { name: 'Finance', slug: 'finance' },
    { name: 'Design', slug: 'design' },
    { name: 'Operations', slug: 'operations' },
    { name: 'Customer Support', slug: 'customer-support' },
    { name: 'Legal', slug: 'legal' },
    { name: 'Other', slug: 'other' },
];

export function generatePrompt(careerPageUrl: string): string {
    const categoryList = CATEGORIES.map(
        (c) => `  - "${c.slug}" (${c.name})`,
    ).join('\n');

    const exampleJson = JSON.stringify(
        {
            total_positions: 4,
            companies: [
                {
                    company_name: 'Example Company',
                    country: 'finland',
                    country_name: 'Finland',
                    country_code: 'FI',
                    career_page_url: careerPageUrl,
                    is_english_company: false,
                    positions: [
                        {
                            country_code: 'FI',
                            title: 'Senior Software Engineer (Helsinki)',
                            url: 'https://example.com/jobs/123',
                            requires_native_language: false,
                            category: 'engineering',
                        },
                        {
                            country_code: 'FI',
                            title: 'Account Manager – Finnish clients',
                            url: 'https://example.com/jobs/124',
                            requires_native_language: true,
                            category: 'sales',
                        },
                    ],
                },
                {
                    company_name: 'Example Company',
                    country: 'germany',
                    country_name: 'Germany',
                    country_code: 'DE',
                    career_page_url: careerPageUrl,
                    is_english_company: false,
                    positions: [
                        {
                            country_code: 'DE',
                            title: 'Vertriebsleiter (Berlin)',
                            url: 'https://example.com/jobs/125',
                            requires_native_language: true,
                            category: 'sales',
                        },
                        {
                            country_code: 'DE',
                            title: 'Backend Engineer (Munich)',
                            url: 'https://example.com/jobs/126',
                            requires_native_language: false,
                            category: 'engineering',
                        },
                    ],
                },
            ],
        },
        null,
        2,
    );

    return `You are a data extraction assistant. Your task is to visit a company's career page, extract **every** open position, and group them by country.

Career page URL: ${careerPageUrl}

## Instructions

1. Visit the URL above and find **all** open positions. You must ensure you have found every single position:
   - **Pagination**: If positions are spread across multiple pages (e.g. "Page 1 of 5", "Next", numbered page links), navigate through **every page** and collect all positions.
   - **"Load more" / "Show all"**: If there is a "Load more", "Show all jobs", or similar button/link, activate it repeatedly until all positions are visible.
   - **Collapsed sections / tabs**: If positions are grouped under expandable sections, department tabs, location filters, or category accordions, expand and check **every** section.
   - **Filters**: If the page has active filters (e.g. by country, department, or location), **remove all filters** or iterate through each filter option to capture all positions. Pay attention to URL parameters like \`CountryID\`, \`location\`, \`department\` that may restrict results.
   - **External job boards**: If the career page embeds or links to an external platform (e.g. Ashby, Lever, Greenhouse, Workday, SmartRecruiters, Teamtailor, Njoyn, Recruitee), follow through to that platform and extract all positions from there.
   - **API / dynamic content**: If positions are loaded dynamically via JavaScript or an API, ensure you wait for or request the full data. Check for API endpoints in the page source if the rendered content appears incomplete.
2. Determine the country for each position based on the job location (city, office, or explicit country label). Include positions from **all countries** — do not filter by country.
   - If a position lists multiple cities that are **all in the same country**, place it under that one country only. Do NOT split it across multiple countries.
   - If a position lists locations that span **genuinely different countries**, create a separate entry for each country.
   - Always look up which country each city belongs to. Do not guess based on language, company name, or nearby countries. For example: Braunschweig, Ettlingen, Ingolstadt, Köln, Munich, and Stuttgart are all cities in **Germany** — a position listing these should only appear under Germany, not Austria, Switzerland, or any other country.
3. Group positions by country. Create one object per country that has at least one position.
4. For each country object, provide:
   - \`country\`: lowercase slug of the country name (e.g. "finland", "united-kingdom", "czech-republic")
   - \`country_name\`: the full English country name (e.g. "Finland", "United Kingdom", "Czech Republic")
   - \`country_code\`: the ISO 3166-1 alpha-2 code (e.g. "FI", "GB", "CZ")
5. For each position, determine:
   a. The exact job title as listed on the page.
      Include \`country_code\` on every position (must match the parent object's \`country_code\`). This prevents positions from being assigned to the wrong country.
   b. Whether the position **requires the native language** of that country (\`requires_native_language\`).

      Set \`requires_native_language: false\` ONLY when ALL of these are true:
      - The role can be performed day-to-day using English alone
      - There is no explicit requirement for the local language (e.g. Finnish, German, Norwegian…)
      - Client, customer, or stakeholder communication does not require the local language

      Set \`requires_native_language: true\` when ANY of these apply:
      - The posting is written entirely in the local language
      - The posting lists the local language as a required skill
      - The role involves client-facing work where the local language is needed, even if the internal company language is English (e.g. "our company language is English, but client projects require Finnish")
      - The description says things like "fluent Finnish required", "native German speaker", or "working with Finnish-speaking customers"

      Note: A company using English internally does NOT automatically mean the role can be done without the local language. Always check whether the **role itself** requires the native language.

      When in doubt, default to \`true\`.

   c. The direct URL to the individual job posting page (\`url\`). This must be the link to that specific position, not the general careers page. If no individual URL exists, omit the field.
   d. The best-fitting category from this list (use the slug value):
${categoryList}

6. Set \`is_english_company: true\` only if the **entire company** operates in English as its primary language (e.g. a US/UK-headquartered company). This applies to all country entries for the same company.

## Output Format

Output ONLY a valid JSON **object** with:
- \`total_positions\`: the total number of positions across all countries (sum of all positions arrays). This makes it easy to verify completeness at a glance.
- \`companies\`: an array of country objects — one object per country.

No markdown code blocks, no explanation, no preamble.

${exampleJson}

## Important

Before producing the final JSON, verify:
- You have navigated through **all pages** of pagination (not just the first page).
- You have expanded all sections, removed all filters, and checked all tabs.
- The total number of positions in your output matches the total shown on the career page (if a count is displayed).
- If the page says "Showing X of Y results", you must have all Y results.

Now extract **all** positions from: ${careerPageUrl}`;
}

export { CATEGORIES };
