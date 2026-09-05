# Task 3 Report: Report linked approved specs on SessionStart

## Scope

Implemented the approved-spec SessionStart context in `hooks/session-start.mjs` and its fixture-based coverage in `tests/hooks.test.mjs`.

- Reads only local `specs/*.md` frontmatter; it makes no network or `gh` calls.
- `frontmatterOf()` returns `null` for unreadable or malformed files, and otherwise returns a status plus an optional positive-integer issue.
- The output includes approved specs, with ` (Issue #number)` only for valid positive issue values. Drafts may be reported; superseded entries are not.
- The hook remains fail-open through guarded directory/file reads.

## TDD evidence

### RED

Added linked, unlinked, and superseded approved-spec fixtures plus output assertions, then ran:

```sh
node --test tests/hooks.test.mjs --test-name-pattern "session-start emits Codex additional context JSON"
```

Result: failed as intended. The old output used `Approved (ready to start)` and omitted the Issue #30 suffix. The run reported 1 failing test and 10 passing tests.

### GREEN

Replaced `statusOf()` with `frontmatterOf()`, limited buckets to approved/draft/superseded, and formatted valid issue links. Re-ran the focused command above.

Result: 11 tests passed, 0 failed.

### Full suite

Ran:

```sh
node --test tests/hooks.test.mjs
```

Result: 11 tests passed, 0 failed (2.18s).

## Commit

`3a68c95 feat(hooks): report approved linked specs`

## Concerns

None. The report itself is intentionally uncommitted as requested.

## Follow-up: malformed quoted status hardening

Addressed the review finding that the status parser accepted an unmatched opening quote such as
`status: "approved` because its opening and closing quote markers were independently optional.

- Added `004-malformed.md` to the SessionStart fixture with `status: "approved`.
- Asserted that `004-malformed.md` is absent from `additionalContext`.
- Changed status parsing to accept only a complete double-quoted, complete single-quoted, or
  unquoted status value; malformed quoting now returns `null` from `frontmatterOf()`.

### TDD evidence

RED command:

```sh
node --test tests/hooks.test.mjs --test-name-pattern "session-start emits Codex additional context JSON"
```

Result: failed as intended because the old parser reported `004-malformed.md` as approved (10
passed, 1 failed).

GREEN command:

```sh
node --test tests/hooks.test.mjs --test-name-pattern "session-start emits Codex additional context JSON"
```

Result: 11 passed, 0 failed.

Full verification:

```sh
node --test tests/hooks.test.mjs
```

Result: 11 passed, 0 failed.
