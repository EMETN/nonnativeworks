// Run once:  pnpm test
// Watch mode: pnpm test:watch

import { test, expect } from 'vitest';
import { detectNativeLanguage, stripHtml } from './language';
import { CASES } from './language.fixtures';

test.each(CASES)('$label', ({ title, desc, country, requires, advantage }) => {
    const result = detectNativeLanguage(title, desc, country);
    const signalSummary = result.signals
        .map((s) => `[${s.phase}] ${s.matched ?? s.description}`)
        .join(' | ');

    expect(
        result.value,
        `requires_native_language wrong — signals: ${signalSummary}`,
    ).toBe(requires);
    expect(
        result.local_language_advantage,
        `local_language_advantage wrong — signals: ${signalSummary}`,
    ).toBe(advantage);
});

test('stripHtml turns no-break and other Unicode spaces into plain spaces', () => {
    expect(
        stripHtml(
            '<p>partner\u00a0sales,\u2009industry&nbsp;or\u3000solution</p>',
        ),
    ).toBe('partner sales, industry or solution');
});

// Microsoft separates words with U+00A0; unstripped, tinyld read this paragraph as "pt".
test('English paragraphs with no-break spaces are not read as another language', () => {
    const paragraph =
        "Doctorate AND demonstrable experience in core sales, partner sales, industry or solution selling, or business development OR Master's Degree AND demonstrable experience in core sales, partner sales, industry or solution selling, marketing, or business development OR Bachelor's Degree AND demonstrable experience in core sales, partner sales, industry or solution selling, marketing, or business development";
    const html = `<p>${paragraph.replaceAll(' ', '\u00a0')}</p>`;

    const result = detectNativeLanguage('Partner Sales', stripHtml(html), 'DE');

    expect(result.value).toBe(false);
});
