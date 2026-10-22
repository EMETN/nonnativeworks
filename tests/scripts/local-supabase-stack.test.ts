import { describe, expect, test } from 'vitest';
import { stackIdArgs } from '../../scripts/local-supabase-stack.mjs';

const stack = (id: string, project_root: string, branch_context: string) => ({
    id,
    project_root,
    branch_context,
});

describe('stackIdArgs', () => {
    test('no stack yet: lets the CLI create one', () => {
        expect(stackIdArgs([], '/workspace')).toEqual([]);
    });

    test('reuses the stack started on another branch', () => {
        const stacks = [stack('abc', '/workspace', 'refs/heads/main')];
        expect(stackIdArgs(stacks, '/workspace')).toEqual([
            '--stack-id',
            'abc',
        ]);
    });

    test("ignores other projects' stacks", () => {
        const stacks = [stack('abc', '/elsewhere', 'refs/heads/main')];
        expect(stackIdArgs(stacks, '/workspace')).toEqual([]);
    });

    test('refuses to guess between several stacks of this project', () => {
        const stacks = [
            stack('abc', '/workspace', 'refs/heads/main'),
            stack('def', '/workspace', 'refs/heads/chore/x'),
        ];
        expect(() => stackIdArgs(stacks, '/workspace')).toThrow(
            /supabase stack destroy --stack-id/,
        );
    });
});
