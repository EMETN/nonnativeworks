// Run once:  pnpm test
// Watch mode: pnpm test:watch

import { test, expect } from 'vitest';
import { detectNativeLanguage } from './language';
import { CASES } from './language.fixtures';

test.each(CASES)('$label', ({ title, desc, country, requires, advantage }) => {
  const result = detectNativeLanguage(title, desc, country);
  const signalSummary = result.signals
    .map((s) => `[${s.phase}] ${s.matched ?? s.description}`)
    .join(' | ');

  expect(result.value, `requires_native_language wrong — signals: ${signalSummary}`).toBe(requires);
  expect(
    result.local_language_advantage,
    `local_language_advantage wrong — signals: ${signalSummary}`,
  ).toBe(advantage);
});
