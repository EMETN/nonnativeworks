import { test, expect } from 'vitest';
import { isHttpUrl } from './safe-url';

test.each([
    ['https://jobs.example.com/1', true],
    ['http://jobs.example.com/1', true],
    ['javascript:alert(1)', false],
    [' JavaScript:alert(1)', false],
    ['data:text/html,<script>alert(1)</script>', false],
    ['mailto:jobs@example.com', false],
    ['/relative/path', false],
    ['', false],
])('isHttpUrl(%j) → %s', (url, expected) => {
    expect(isHttpUrl(url)).toBe(expected);
});
