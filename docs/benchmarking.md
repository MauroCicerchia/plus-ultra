# Workflow benchmarking

The workflow benchmark is a manual, local tool for measuring representative Plus Ultra workflows.
It is intentionally absent from hooks and CI: a person chooses when to spend model tokens, reviews
the retained artifacts, and decides whether a result is suitable for a durable baseline.

The canonical profile uses model `gpt-5.6-sol` with reasoning `medium`. Results from another model,
reasoning effort, Codex version, scenario suite, or source tree are still useful, but they are a
different environment and may not be compared as if only the workflow changed.

## Prerequisites and local setup

Run the benchmark from a clean Plus Ultra Git worktree on macOS or Linux. It requires Node.js, Git,
and an authenticated Codex CLI capable of `codex exec --json`. The fixture itself has no package
dependencies.

Install the current working tree as the managed local Codex snapshot before validating or running:

```sh
node scripts/codex-local.mjs refresh
node scripts/benchmark-workflows.mjs validate
```

`refresh` validates packaging, stages Git-included source below `.context/`, registers the managed
`plus-ultra-dev` marketplace, and installs that development plugin. It temporarily removes the
stable `plus-ultra` installation so the benchmark cannot accidentally load both versions. Open a
new Codex thread for normal interactive dogfooding; non-interactive benchmark processes load the
installed development snapshot directly.

`validate` requires all five coherent scenario manifests, the six canonical phases, an executable
fake `gh`, a clean source tree, a byte-for-byte matching managed snapshot (apart from the local
manifest version), and a supported Codex installation. If source files change, commit or otherwise
return the tree to a clean intended state, refresh again, and re-run validation.

When benchmarking is finished, restore the released plugin and remove the managed development
registration:

```sh
node scripts/codex-local.mjs restore
```

## Safety boundary

Every sample copies the dependency-free reading-list fixture into a fresh temporary Git repository.
Codex receives `--sandbox workspace-write` and works only in that repository. The runner creates a
per-sample fake-`gh` wrapper and writable state below `.plus-ultra-benchmark/` in that clone. It also
uses a controlled `HOME`, `ZDOTDIR`, and shell profiles while preserving the original explicit
`CODEX_HOME`. Those profiles reset `PATH` after login-shell initialization, and the safe path drops
every inherited directory containing another `gh`. Command-local attempts to redirect the fake's
state or audit variables are overwritten by the wrapper. Scenarios therefore cannot fall through
to the real GitHub CLI or silently record against a different fake state.

The fake rejects undeclared operations and the runner copies its designated state and audit to the
raw sample directory before deleting a successful clone. Review cleanup can resolve only the
benchmark-created thread declared by the fixture. The private Git exclude ignores the runner's
runtime directory and exactly `.codex/plus-ultra/state/`, which lifecycle hooks create; arbitrary
changes elsewhere under `.codex/` remain visible to workflow scope checks. The benchmark never
reads from or writes to real GitHub.

These controls are deliberately narrow and cooperative, not permission to publish or integrate.
Benchmark prompts forbid commits, pushes, merges, releases, tags, and network access. Keep those
actions outside benchmark runs.

## Scenarios and phases

The suite contains exactly five scenarios and reports six phase aggregates:

| Scenario | Reported phase |
| --- | --- |
| Product discovery | `product-discovery` |
| Spec creation/refinement | `spec-refinement` |
| Localized FAST correction | `fast-implementation` |
| Multi-file STANDARD TDD change | `standard-implementation` |
| PR review cycle, blocked head | `first-pr-review` |
| PR review cycle, corrected head | `pr-re-review` |

The PR review phases share one declarative scenario but are sampled and aggregated independently.
Product and spec workflows use a proposal turn followed by an explicit resumed approval turn.

## Metric semantics

Every measurement carries a `value` and one of three labels:

- `exact` means the value was read only from the documented `turn.completed.usage` JSONL event.
  Input, cached-input, output, and reasoning token counts use this label. If Codex omits a field in
  any completed turn, its aggregate remains `null`; the benchmark does not guess.
- `observed` means the runner counted or measured visible execution data. Non-cached input is the
  derived difference `input_tokens - cached_input_tokens` when both exact fields exist. Turns,
  item/tool-call types, tool-call count, elapsed milliseconds, and visible-context bytes are also
  observed. They are not exact model-context token counts.
- `estimated` identifies a context-inventory proxy whose bytes are inferred from a static source or
  expected visible output. Estimated bytes must never be described as exact tokens.

Missing data stays `null`. Negative or inconsistent usage is rejected. Numeric phase aggregates
are medians of successful samples; observed type lists are deterministic sorted unions.

## Inventory

Inspect static and visible-output contributors without running a model:

```sh
node scripts/benchmark-workflows.mjs inventory
```

The descending ranking covers `AGENTS.md`, session-start injection, invoked skill bodies, durable
artifacts, prompts, fake tool payloads, and verification/review outputs. Each contributor retains
its observed or estimated label; its byte count is a context proxy, not token accounting.

### Verification-output A/B probe

Measure the deterministic direct-versus-wrapper success-output corpus with:

```sh
node scripts/benchmark-workflows.mjs verification-output-probe
```

The probe creates a temporary Git fixture, runs the same deterministic TAP-emitting verification
directly and through `skills/verification/assets/plus-ultra-verify.mjs`, then compares their
model-visible UTF-8 byte counts. It reports observed bytes, bytes removed, and the reduction ratio.
It requires no model run, network access, or project checkout; it is not a claim of exact token
usage. The wrapper projection must stay at or below 1 KiB and reduce the direct visible-byte proxy
by at least 80%. The fixture ignores `.context/`, so the wrapper receipt cannot make its own source
state stale.

This diagnostic is deliberately outside the canonical suite. It does not add a scenario or phase,
does not affect suite hashes or baseline comparability, and cannot be recorded as workflow data.

### PR re-review A/B probe

Measure the same small-fix `pr-review-cycle` re-review with a control plugin built from an explicit
baseline Git SHA and with the candidate plugin, using the same model, reasoning effort, Codex
version, and benchmark inputs. Run the two diagnostic `pr-review-cycle` samples separately, retain
their local summaries, then compare them without adding a CI gate:

```sh
node scripts/benchmark-workflows.mjs pr-rereview-probe \
  --baseline .context/benchmarks/<control-run>/summary.json \
  --candidate .context/benchmarks/<candidate-run>/summary.json
```

The probe rejects unmatched model, reasoning, Codex version, suite, or scenario identities. It uses
exact `input_tokens + output_tokens` when both runs provide them; otherwise it reports observed
`visible_context_bytes`. Its result includes `reduction`, a `0.3` target, and `meets_target`; raw
control and candidate artifacts remain under `.context/benchmarks/`.

## Run and adaptive sampling

Run the complete canonical suite explicitly:

```sh
PLUS_ULTRA_BENCHMARK_RUN_ID=<safe-run-id> \
  node scripts/benchmark-workflows.mjs run --model gpt-5.6-sol --reasoning medium
```

The run ID is optional for a fresh run but required for recovery. It may contain only letters,
digits, dots, underscores, and hyphens. The command prints the path to
`.context/benchmarks/<run-id>/summary.json`. A new standalone `--scenario <id>` run is diagnostic
and cannot be recorded as a baseline.

Each phase starts with two successful samples. The runner compares exact total tokens
(`input_tokens + output_tokens`) when available, otherwise its observed visible-context-byte proxy.
It runs one adaptive third sample for that phase only when
`abs(a - b) / median(a, b) > 0.10`. A non-zero difference from a zero median also requires the
third sample. Exactly 10% does not. Failed attempts never count as successful measurements or
satisfy completeness, and unrelated scenarios continue after a failure.

### Recover one failed scenario

If a full run is incomplete, repeat its explicit run ID and select the one failed scenario:

```sh
PLUS_ULTRA_BENCHMARK_RUN_ID=<same-safe-run-id> \
  node scripts/benchmark-workflows.mjs run \
  --model gpt-5.6-sol --reasoning medium --scenario <failed-scenario-id>
```

Recovery is deliberately fail-closed. The existing summary must contain all five scenario results
and all six canonical phases; only the selected scenario may be failed. The requested model and
reasoning, Codex version, operating system, architecture, every suite/scenario/source/plugin hash,
and ranked contributor inventory must match exactly. Prior successful samples, aggregates, and
budgets must also validate. Complete, malformed, partial, profile-mismatched, or drifted runs are
refused before any artifact is moved.

The runner archives the selected scenario's old raw directory under
`attempts/<scenario>-attempt-N/`, never overwriting an earlier attempt. It then reruns only that
scenario, preserves every other phase's sample measurements, and recomputes the combined scenario
statuses, phase aggregates, budgets, and contributors. A failed recovery remains incomplete and
can be retried safely; do not splice or hand-edit summaries and do not reuse samples after any
identity hash changes.

## Raw local artifacts and failure retention

Detailed output stays unversioned below `.context/benchmarks/<run-id>/`. Each sample directory can
contain raw JSONL, stderr, the extracted model response, fake-GitHub state, and its fake-GitHub audit
log. The summary also contains local paths and transient sample metadata. Treat all of it as local
diagnostic material, not content for a commit.

Scenario recovery retains each replaced scenario directory below that run's `attempts/` directory.
These archives have the same raw-data sensitivity and cleanup rules as the active scenario output.

A successful sample deletes its temporary fixture repository after postconditions pass. On any
failure, the runner moves the failed repository into that sample directory and records the path in
the incomplete summary. Inspect that failed repository before cleanup; retention is intentional so
a model, fixture, postcondition, or fake-tool failure can be reproduced.

## Record a sanitized baseline

Record only a complete all-scenario summary:

```sh
node scripts/benchmark-workflows.mjs record \
  --run .context/benchmarks/<run-id>/summary.json \
  --baseline benchmarks/baselines/<name>.json
```

`record` refuses partial suites, failed attempts, missing aggregates, missing adaptive samples, or
extra samples. It recomputes all six phase aggregates and budgets from successful measurements,
then passes the result through an allow-list sanitizer. The committed result contains only schema
version, profile, immutable hashes, aggregate metrics, budgets, ranked contributors, and minimal
environment metadata. It excludes prompts, responses, thread IDs, absolute paths, command output,
stderr, raw logs, run IDs, and sample records.

Budgets are median aggregate plus 20%, rounded upward: token counts to the next 1,000, output tokens
to the next 100, visible-context bytes to the next KiB, and turns/tool calls to the next integer.
Unavailable source values produce `null` budgets.

The repository's canonical initial result is `benchmarks/baselines/initial.json`. Regenerate it
only from a reviewed complete run of the canonical profile; do not hand-edit measured values.

## Compare and interpret drift

Compare two sanitized baselines without creating a CI gate:

```sh
node scripts/benchmark-workflows.mjs compare \
  --baseline benchmarks/baselines/initial.json \
  --candidate benchmarks/baselines/candidate.json
```

For comparable metrics, output includes baseline, candidate, numeric delta, budget, and `within` or
`over` status. Token and visible-count comparisons require the same requested model, reasoning
effort, Codex version, suite hash, and owning scenario hash. Elapsed time additionally requires the
same operating system and architecture. A mismatch is reported as environment drift with no
numeric delta; it is evidence to rerun under matching conditions, not a regression verdict.

## Cleanup

After reviewing or recording a run, delete only the specific local run directory you resolved from
the command output, for example `.context/benchmarks/<run-id>/`. Do not use a broad recursive target
or delete a retained failed repository before collecting the diagnostics you need. Raw artifacts
are ignored by Git and otherwise remain until a person removes them.

Finally run `node scripts/codex-local.mjs restore` to reinstate stable Plus Ultra. Baselines and
comparisons remain manual-only; do not add benchmark execution to hooks or CI.
