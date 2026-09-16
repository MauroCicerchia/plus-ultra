Benchmark protocol: `standard-tag-filtering-tdd-v1`.

Implement the approved contract in `specs/001-tag-filtering.md` as STANDARD multi-file work. Use
TDD: add `test/tag-filtering.test.mjs` with the named case `supports repeatable normalized tags
through the CLI`, run that failing test first and observe the expected failure, then implement the
minimum behavior. Run `node --test test/tag-filtering.test.mjs` and the complete `node --test` suite
green.

Required production changes span `src/library.mjs`, `src/format.mjs`, and `src/cli.mjs`:

- `addEntry(entries, title, tags = [])` stores normalized, deduplicated, sorted lowercase tags;
- export pure `filterByTag(entries, tag)` with case-insensitive matching and no input mutation;
- `add <title> [--tag <tag>...]` accepts repeatable tags;
- `list [--tag <tag>]` filters when supplied;
- formatted tags are appended in sorted order as ` #tag`, while untagged output is unchanged.

Add or update tests under `test/`. Run `node --test` and
`node scripts/check-postcondition.mjs standard`. Do not add dependencies, invoke `gh`, access a
network, commit, push, merge, release, or tag.
