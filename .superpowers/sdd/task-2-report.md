# Issue 52 — Task 2 report: deterministic integration gate

## Scope delivered

Added the dependency-free `hooks/integration-gate.mjs` PreToolUse hook and focused regression
coverage in `tests/hooks.test.mjs`. The hook is deliberately **not** registered in either hook
manifest; registration belongs to Task 3.

The gate uses a bounded shell classifier (100,000-character input limit; eight nested parsing
levels) that understands shell separators, quoting, escapes, assignments, path-qualified
executables, `env`, `command`, `sudo`, `nice`, `timeout`, `nohup`, and `xargs`. It recursively
examines `sh`/`bash`/`zsh -c`, `eval`, `$()` and backticks. It blocks only the Task 2 recognized
integration forms and fails open when command parsing or local Git discovery cannot safely
complete.

## RED / GREEN evidence

Each functional addition was made test-first and verified with Node's test runner:

1. **Original incident, Claude payload**
   - RED: `node --test --test-name-pattern='integration gate blocks the gh stack merge incident' tests/hooks.test.mjs`
     failed with `MODULE_NOT_FOUND` for `hooks/integration-gate.mjs`.
   - GREEN: the same command passed after the minimal `gh stack merge` gate.
2. **Direct operations and Codex payload**
   - RED: `node --test --test-name-pattern='direct merge and release' tests/hooks.test.mjs`
     failed with `SyntaxError: Unexpected end of JSON input`, because `gh pr merge` and release
     creation were allowed.
   - GREEN: the original and direct-operation tests passed (2/2).
3. **Parser recursion, wrappers, compound commands, and quoted prose**
   - RED: `node --test --test-name-pattern='parses nested and wrapped' tests/hooks.test.mjs`
     failed because the direct matcher returned no decision for assignment/path/wrapper cases.
   - GREEN: parser tests passed (3/3) after introducing the bounded classifier.
4. **Protected, broad, and tag pushes**
   - RED: `node --test --test-name-pattern='protected, broad, and tag pushes' tests/hooks.test.mjs`
     failed because no `git push` operation was classified.
   - GREEN: the four integration-gate test groups passed after local-ref and local-tag handling.
5. **Mutating GitHub APIs**
   - RED: `node --test --test-name-pattern='recognized mutating GitHub APIs' tests/hooks.test.mjs`
     failed because recognized REST and GraphQL mutations were allowed.
   - GREEN: five integration-gate test groups passed after targeted `gh api` classification.
6. **Operational wrapper edge case**
   - RED: `node --test --test-name-pattern='operational wrappers and leaves escaped prose' tests/hooks.test.mjs`
     failed because `xargs -n 1 gh stack merge --yes --squash` was allowed.
   - GREEN: `node --test --test-name-pattern='integration gate' tests/hooks.test.mjs` passed all
     7 focused integration-gate tests after adding `xargs` unwrapping.
7. **API endpoint option handling**
   - RED: the GitHub API case with `--hostname api.github.com` failed because the option value was
     mistaken for the endpoint and no decision was emitted.
   - GREEN: `node --test --test-name-pattern='recognized mutating GitHub APIs' tests/hooks.test.mjs`
     passed after skipping endpoint-unrelated API option values.

The focused suite covers structured denial; Claude and Codex payload shapes; direct, nested,
wrapped, path-qualified, and compound commands; all specified deny paths; all specified allow
paths; quoted/search/example prose; and malformed/unavailable-local-Git fail-open behavior.

## Final verification

- `node --check hooks/integration-gate.mjs` — passed.
- `node --test tests/*.test.mjs` — passed: 48 tests, 0 failures.
- `git diff --check` — passed.
- `rg -n 'integration-gate\\.mjs' hooks/hooks.json hooks/hooks-codex.json` returned no matches;
  the explicit non-registration check passed.

## Files changed

- `hooks/integration-gate.mjs`
- `tests/hooks.test.mjs`
- `.superpowers/sdd/task-2-report.md`

## Self-review

- The gate uses `_lib.mjs`'s structured `deny()` decision and emits no output for allowed calls.
- Default-branch resolution reads only local Git refs via `git for-each-ref`; it always retains
  `main` and `master` as fallbacks. Local tag recognition uses `git tag --list` only.
- Parsing and local Git failures are caught at the hook boundary and fail open; no network call,
  persistent state, dependency, manifest, documentation, spec, or version change was introduced.
- The classifier is intentionally bounded and recognizes explicit command forms rather than trying
  to interpret shell variables, aliases, or arbitrary generated commands. Those indirections fail
  open by design, consistent with the cooperative guardrail boundary.
