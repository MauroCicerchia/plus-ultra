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

## Review fixes — 2026-09-06

The review of commit `6920303` exposed lost shell boundaries and option-value confusion in the
initial classifier. All confirmed review cases now have executable regression coverage.

### Reproduction and RED evidence

Before editing production code, added independently named `integration gate review:` tests and
ran `node --test --test-name-pattern='integration gate review:' tests/hooks.test.mjs`:
**54 test nodes; 9 passed; 45 failed**. One failure was the aggregate push-target parent;
the remaining **44 were specific assertion failures**, with the actual allow/deny decision
opposite to the expected decision. They cover:

- Newline command separators, backslash-newline continuation (including inside an executable
  word), quoted assignment values, and executable paths containing spaces.
- `env -S` and `--split-string=`, sudo assignments, and non-executing `command -v`/`-V` lookups.
- Comment prose/substitutions, quotes inside comments before a real command, preview words inside
  comments, quoted heredoc prose, and heredoc quotes before a real command.
- Git `-c`, `--config-env=`, and `-C`; gh `-R` and `--repo=` before a subcommand.
- `--help`/`--dry-run` as release notes/title, API field, and push-option values; actual Git `-n`
  and combined `-fn` dry-run flags.
- Compact API `-fvalue`/`-Fvalue`, `--raw-field=value`, `--field=value`, and `--input=value` forms,
  including their implicit POST semantics; GraphQL read-only queries with mutation text in output
  templates and jq expressions.
- Wildcard/matching refspecs; `HEAD` and omitted refspecs on `main` and locally discovered `trunk`;
  `--repo=origin`; paired local-tag refspecs and tag deletions.

The explicit `git push --delete origin main` and `git push --repo origin main` examples already
passed before the fix, so they remain controls. The related `:v1` tag deletion and `--repo=origin`
forms failed and were fixed. Other passing controls protect feature pushes, explicit branch
destinations that share a local tag name, and `main:feature/review` pushes.

### Changes and GREEN evidence

The bounded parser now preserves newlines, removes line continuations, consumes comments and
heredoc bodies as shell data, and inspects only the substitutions that an unquoted heredoc
executes. Quoted assignments and executable paths reach normal classification. Wrapper handling
splits `env -S` into words with a bound of eight splits, consumes sudo assignments, and treats
`command -v`/`-V` as lookups.

CLI parsing now consumes option values, supports attached and equals forms, respects `--`, and
recognizes preview flags in command-specific option contexts. Git repository selectors are passed
only to local reference discovery. Current branch detection uses local `symbolic-ref`; wildcard,
matching, repository-option, paired-tag, and tag-deletion destinations are classified explicitly.
GraphQL classification reads the query field and excludes output formatting, strings, and comments.

Targeted GREEN runs after each implementation group:

- Shell boundaries/quotes/comments/heredocs: **11/11 passed**.
- Wrapper semantics: **5/5 passed**.
- gh global options/API/preview fixes plus existing API coverage: **13/13 passed**.
- All original and initial review integration-gate tests: **61/61 passed**.

Self-review then found five adjacent gaps. Added their tests first and observed **5/5 fail** for
release `-p --help`, GraphQL query string text and operation names, `refs/*:refs/*`, and a `tag`
keyword following another refspec. After the fixes, the same five tests passed. A separate
here-string `<<<` regression was also captured **RED (1 failed)** before distinguishing it from
heredoc `<<`; it and the option/heredoc control group then passed **2/2**. These runs used
`--test-name-pattern` matching the corresponding `integration gate review:` names.

The control group verifies quoted versus unquoted heredoc substitutions, tab-stripped and multiple
heredocs, env-split help, merge body values, overridden dry-run flags, `--` termination, explicit
GET with compact fields, and a compact GraphQL mutation field.

### Final verification after review fixes

- Covering file: `node --test tests/hooks.test.mjs` — **79 tests passed, 0 failed**.
- Full suite: `node --test tests/*.test.mjs` — **109 tests passed, 0 failed**.
- `node --check hooks/integration-gate.mjs` and `git diff --check` — passed.
- Explicit check of `hooks/hooks.json` and `hooks/hooks-codex.json` — gate remains unregistered.
- `claude plugin validate .` and `claude plugin validate .claude-plugin/plugin.json` — passed.
  The second path validates this repository's actual root plugin layout; there is no nested
  `./plus-ultra` plugin directory.
- Clean Codex installation and hook registration remain part of Task 3's packaging validation;
  neither installed plugin state nor manifests were changed in this fix.

Git push argument semantics were checked against the [Git push manual](https://git-scm.com/docs/git-push),
and API method/field semantics against the [gh api manual](https://cli.github.com/manual/gh_api).
Installed CLI help also confirmed command-specific short options.

### Remaining bounds

The hook remains a cooperative, fail-open classifier: no network access, persistent state,
dependency, manifest registration, or execution of the inspected command was added. It retains the
100,000-character/eight-level limits. Shell variables, aliases, generated scripts, arbitrary Git
push configuration mappings, and API request bodies supplied through files remain outside its
literal-command classifier. Implicit pushes are inferred from the local current branch; GraphQL
recognition covers inline mutation documents, not a complete GraphQL execution engine. No reviewed
regression remains failing.

## Second re-review fixes — 2026-09-06

### Root cause and RED evidence

The confirmed second re-review cases were parser/classifier token-state defects, not environment
or Git-discovery failures. Before changing `hooks/integration-gate.mjs`, five independently named
`integration gate re-review:` tests were added to `tests/hooks.test.mjs` and run with:

```sh
node --test --test-name-pattern='integration gate re-review:' tests/hooks.test.mjs
```

The result was **5 tests failed, 0 passed**, each with the expected inverse decision:

- The `$()` reader treated a bare nested subshell `)` and a comment `)` as the outer command
  substitution close. A merge command later in that still-active substitution was then treated as
  quoted outer text and allowed.
- GraphQL classification only accepted documents beginning with `mutation`; a literal document
  starting with a fragment and selected by `operationName=Integrate` was allowed even though that
  mutation expanded a `mergePullRequest` fragment. The paired selected query control must allow.
- Push classification treated any `refs/tags/` occurrence or a source-side local tag as
  publication, incorrectly denying `refs/tags/v1:refs/heads/feature/review`; its destination-tag
  counterpart must still deny.
- Push broad/tag checks used `some()` over all parsed options, so an earlier `--all`, `--mirror`,
  `--tags`, or `--follow-tags` could not be disabled by a later matching `--no-*` flag.
- Wrapper/classifier recursion continued through non-executing `env --help`, `bash --help -c`, and
  shell `-n -c` forms, which do not execute the inspected nested command.

### Minimal fixes and GREEN evidence

- The command-substitution reader now tracks shell word/comment state and nested bare parentheses
  in addition to nested `$()` forms, preserving the outer substitution boundary.
- The GraphQL path now masks strings/comments, reads literal top-level definitions, selects the
  requested operation by `operationName` (or the sole operation), and follows only fragments
  reachable from a selected mutation before matching recognized integration fields.
- Git push checks evaluate a destination refspec only: a tag source targeting `refs/heads/...` is
  allowed, while `refs/tags/...` and known bare tag destinations remain publication. Push option
  state is ordered, so a later `--no-*` turns off its earlier positive counterpart.
- `env --help` stops wrapper unwrapping; shell help and `-n`/`--noexec` forms skip `-c` recursion.

After the implementation, the same targeted command passed **5/5**. The complete focused hook
file was then rerun:

```sh
node --test tests/hooks.test.mjs
```

It passed **84 tests, 0 failures**, including all earlier incident, review, and re-review controls.
The full repository suite (`node --test tests/*.test.mjs`) then passed **114 tests, 0 failures**.
The gate remains unregistered; no manifests, dependencies, persistent state, or external command
execution were added.

## Final review fixes — 2026-09-06

### Root cause and RED evidence

The final review found three independent literal-classification gaps. Before production changes,
the focused regression command below completed with **0 passed and 3 failed**:

```sh
node --test --test-name-pattern='integration gate final review:' tests/hooks.test.mjs
```

- Unquoted leading redirections and shell structural words (`{`, `then`) remained at the head of a
  token list, and `exec` was not an execution wrapper, so the following `gh` operation was allowed.
  The regression covers `>/dev/null gh pr merge`, `2>/dev/null gh stack merge`, a brace group, an
  `if` body, and `exec gh pr merge`, alongside harmless `echo` controls.
- `git -c remote.origin.push=HEAD:refs/heads/main push origin` on a feature branch ignored the
  command-line remote push refspec and was allowed. The paired `push upstream` control confirms a
  config entry is used only for its selected literal remote.
- `gh api .../releases/generate-notes -f tag_name=v1` was incorrectly caught by the generic
  mutating-release endpoint rule even though it only prepares release notes.

### Minimal fixes and GREEN evidence

The classifier now skips only unquoted leading shell redirections and structural command prefixes,
then unwraps `exec` (including its `-a` value). `git push` uses literal, whitespace-free
`-c remote.<selected-remote>.push=<refspec>` values only when no explicit command refspec is
present; it does not infer a remote or inspect arbitrary configuration. The exact
`releases/generate-notes` REST endpoint is exempted before the generic releases mutation rule.

The same focused regression command passed **3/3** after the fixes. Subsequent verification:

- `node --check hooks/integration-gate.mjs` — passed.
- `node --test tests/hooks.test.mjs` — **87 passed, 0 failed**.
- `node --test tests/*.test.mjs` — **117 passed, 0 failed**.

The gate remains unregistered; neither hook manifest was changed.

## Bounded final fixes — 2026-09-06

### Root cause and RED evidence

Two approved literal parser cases were added before changing production code and run with:

```sh
node --test --test-name-pattern='integration gate bounded final fix:' tests/hooks.test.mjs
```

The result was **0 passed, 2 failed**, each with the expected inverse decision:

- `bash -o pipefail -c 'gh pr merge 42'` stopped option scanning at the `-o` value, so the
  following `-c` command was allowed. The same regression also covers bundled short options with
  `-c` (`bash -ec 'gh pr merge 42'`).
- `>"/dev/null" gh pr merge 42` marked its token quoted because the *target* was quoted, so the
  unquoted redirection operator was not skipped and the merge was allowed.

### Minimal fixes and GREEN evidence

Shell option scanning now consumes exactly the value following `-o` before continuing to locate
`-c`. Shell tokens retain whether their first character was quoted, allowing a redirection with a
quoted target to remain a prefix without treating a wholly quoted word as a redirection.

The same focused command then passed **2/2**. Fresh follow-up verification passed:

- `node --check hooks/integration-gate.mjs` — passed.
- `node --test tests/hooks.test.mjs` — **89 passed, 0 failed**.
- `node --test tests/*.test.mjs` — **119 passed, 0 failed**.
- `git diff --check` — passed.
- `rg -n 'integration-gate\\.mjs' hooks/hooks.json hooks/hooks-codex.json` returned no matches;
  the gate remains unregistered and neither manifest changed.

No parser architecture, additional shell syntax, dependencies, manifests, persistent state, or
external command execution was added.
