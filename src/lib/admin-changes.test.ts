import { test, expect, vi } from 'vitest';
import { changedBy, recordChange } from './admin-changes';

test('changedBy returns "scraper" when the scraper secret header is present', () => {
    const request = new Request('https://x', {
        headers: { 'x-scraper-secret': 'anything' },
    });
    expect(changedBy({ user: { email: 'a@b.c' } }, request)).toBe('scraper');
});

test('changedBy returns the user email when no scraper header', () => {
    const request = new Request('https://x');
    expect(changedBy({ user: { email: 'a@b.c' } }, request)).toBe('a@b.c');
});

test('changedBy falls back to "unknown" with no user and no header', () => {
    const request = new Request('https://x');
    expect(changedBy(undefined, request)).toBe('unknown');
});

test('recordChange inserts the change row', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ insert })) } as never;
    await recordChange(supabase, {
        entity_type: 'skill',
        action: 'deleted',
        label: 'Python',
        changed_by: 'a@b.c',
    });
    expect(insert).toHaveBeenCalledWith({
        entity_type: 'skill',
        action: 'deleted',
        label: 'Python',
        changed_by: 'a@b.c',
    });
});

test('recordChange swallows a Supabase error instead of throwing', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: 'boom' } });
    const supabase = { from: vi.fn(() => ({ insert })) } as never;
    await expect(
        recordChange(supabase, {
            entity_type: 'company',
            action: 'updated',
            label: 'Acme',
            changed_by: 'scraper',
        }),
    ).resolves.toBeUndefined();
});
