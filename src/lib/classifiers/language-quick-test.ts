/**
 * Quick-test harness for language-classifier signal development.
 * Run with:  pnpm tsx src/lib/classifiers/language-quick-test.ts
 *
 * Drop any new real-world phrase into PROBES below and re-run to see
 * whether the classifier catches it before adding formal fixtures.
 */

import { detectNativeLanguage } from './language';

type Probe = {
  desc: string;
  country: string;
  expectRequires: boolean;
  expectAdvantage: boolean;
};

const PROBES: Probe[] = [
  // ── Phrases reported as unhandled (2026-04-30) ───────────────────────────
  {
    desc: 'Fluency in English (additional Dutch is considerd a plus).',
    country: 'NL',
    expectRequires: false,
    expectAdvantage: true,
  },
  {
    desc: 'German, French, or other European languages are a strong advantage',
    country: 'DE',
    expectRequires: false,
    expectAdvantage: true,
  },
  {
    desc: 'Fluent in English and ideally in German; additional European languages are a plus',
    country: 'DE',
    expectRequires: false,
    expectAdvantage: true,
  },
  {
    desc: 'Fluent in English; German or additional European languages are a plus',
    country: 'DE',
    expectRequires: false,
    expectAdvantage: true,
  },
  {
    desc: 'Fluent in English, with German or another European language considered a strong advantage',
    country: 'DE',
    expectRequires: false,
    expectAdvantage: true,
  },
  {
    desc: 'You communicate fluently in Finnish and have good English skills',
    country: 'FI',
    expectRequires: true,
    expectAdvantage: false,
  },
  {
    desc: 'Fluent in English, German is a plus',
    country: 'DE',
    expectRequires: false,
    expectAdvantage: true,
  },
  {
    desc: 'fluent Finnish skills are considered as an advantage.',
    country: 'FI',
    expectRequires: false,
    expectAdvantage: true,
  },
  {
    desc: 'Fluent level in German',
    country: 'DE',
    expectRequires: true,
    expectAdvantage: false,
  },
  {
    desc: 'Finnish and/or Swedish skills in both oral and written are seen as a big advantage',
    country: 'FI',
    expectRequires: false,
    expectAdvantage: true,
  },
  {
    desc: 'Proficiency in one of the Nordic languages is beneficial.',
    country: 'FI',
    expectRequires: false,
    expectAdvantage: true,
  },
];

// ── runner ────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

for (const probe of PROBES) {
  const result = detectNativeLanguage('Engineer', probe.desc, probe.country);
  const reqOk = result.value === probe.expectRequires;
  const advOk = result.local_language_advantage === probe.expectAdvantage;
  const ok = reqOk && advOk;
  const icon = ok ? '✓' : '✗';
  const signal = result.signals.map(s => `[${s.phase}] ${s.matched ?? s.description}`).join(' | ');

  if (ok) {
    passed++;
    console.log(`${icon} ${probe.country} | ${probe.desc.slice(0, 70)}`);
  } else {
    failed++;
    console.log(`${icon} ${probe.country} | ${probe.desc.slice(0, 70)}`);
    if (!reqOk) console.log(`    requires: expected=${probe.expectRequires} got=${result.value}`);
    if (!advOk) console.log(`    advantage: expected=${probe.expectAdvantage} got=${result.local_language_advantage}`);
    console.log(`    signals: ${signal}`);
  }
}

console.log(`\n${passed}/${PROBES.length} passed`);
