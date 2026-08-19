#!/usr/bin/env node
// Fails CI when build wall-time or page count exceeds the budget.

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_SECONDS = Number(process.env.BUILD_BUDGET_SECONDS ?? 480);
const MAX_PAGES = Number(process.env.BUILD_BUDGET_PAGES ?? 10_000);

const elapsedSeconds = Number(process.argv[2]);
if (!Number.isFinite(elapsedSeconds)) {
    console.error('Usage: check-build-budget.mjs <elapsed-seconds>');
    process.exit(2);
}

function countHtml(dir) {
    let total = 0;
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
            total += countHtml(path);
        } else if (entry.endsWith('.html')) {
            total += 1;
        }
    }
    return total;
}

let pages = 0;
try {
    pages = countHtml('dist');
} catch {
    console.error('No dist/ directory — run a build first.');
    process.exit(2);
}

console.log(
    `Build budget: ${elapsedSeconds}s / ${MAX_SECONDS}s, ${pages} / ${MAX_PAGES} pages`,
);

const failures = [];
if (elapsedSeconds > MAX_SECONDS) {
    failures.push(
        `build took ${elapsedSeconds}s, over the ${MAX_SECONDS}s budget`,
    );
}
if (pages > MAX_PAGES) {
    failures.push(`build emitted ${pages} pages, over the ${MAX_PAGES} budget`);
}

if (failures.length > 0) {
    console.error('Build budget exceeded:');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(
        'See the Scalability section of the SSG design spec for the escalation path.',
    );
    process.exit(1);
}
