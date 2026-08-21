# Vendored agent skills

The skills under `skills/` are vendored, unmodified, from Supabase's
[`supabase/agent-skills`](https://github.com/supabase/agent-skills) repository.
They are developer tooling for AI coding agents (used here for Supabase and
Postgres work) and are not part of the shipped site.

Exact versions and content hashes are pinned in `../skills-lock.json`.
`.claude/skills/*` symlinks into this directory and is git-ignored.

## Licence

These files are distributed under the MIT Licence, Copyright (c) 2026 Supabase.
The full licence text is in [`LICENSE`](./LICENSE), retained here to satisfy the
MIT requirement that the copyright and permission notice travel with all copies.
