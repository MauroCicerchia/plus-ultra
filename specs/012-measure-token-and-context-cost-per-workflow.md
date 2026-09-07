---
title: Measure token and context cost per workflow
status: approved
issue: 62
created: 2026-09-07
---

# 012 — Measure token and context cost per workflow

## Problem

Plus Ultra has no reproducible baseline for how much model usage its workflows consume. Without a
baseline, later optimizations can appear successful while moving cost from one phase to another,
and anecdotal measurements cannot distinguish a workflow change from model, prompt, fixture, or
environment drift. The benchmark must measure representative end-to-end work while keeping model
artifacts and GitHub interactions local and safe.

## Goals / Non-goals

**Goals**

- Provide a dependency-free, local benchmark for five representative scenarios and six measurable
  workflow phases.
- Capture exact Codex usage only where the documented JSONL event exposes it, and label every other
  observed or estimated metric explicitly.
- Make every run reproducible and comparable through immutable scenario, prompt, fixture, fake
  GitHub, repository-tree, and environment identifiers.
- Produce sanitized, versionable aggregates, ranked context contributors, and initial budgets for
  later Issue #61 optimizations.
- Keep raw JSONL, stderr, responses, failed temporary repositories, and other detailed artifacts in
  `.context/benchmarks/`, with no benchmark execution in normal hooks or CI.

**Non-goals**

- Build hosted telemetry, an analytics service, or a production usage collector.
- Block development on perfect token accounting or treat one synthetic micro-benchmark as
  representative of all work.
- Change workflow behavior, add runtime dependencies, or authorize real GitHub operations.
- Merge, publish, tag, release, or automatically integrate benchmark changes.

## Acceptance criteria

- [ ] A documented CLI process validates and runs exactly five scenarios, producing six phase
      aggregates: product discovery; spec creation/refinement; FAST implementation; STANDARD
      implementation; first PR review; and PR re-review after fixes.
- [ ] Each successful phase has two samples and runs a third sample only when
      `abs(a-b) / median(a,b) > 0.10` for an available numeric metric; the aggregate is the
      median of the two or three successful samples.
- [ ] Every run records immutable hashes for the scenario, prompts, fixture, fake GitHub responses,
      suite, Git tree, and plugin tree, together with Codex version, requested model, and reasoning
      effort.
- [ ] Usage metrics are retained for input, cached input, non-cached input, output, and reasoning
      tokens; turns, item/tool-call types, elapsed time, and visible-byte context proxies are also
      retained when available. Missing values remain `null`.
- [ ] Only fields read from a documented `turn.completed.usage` event are labeled `exact`; other
      measurements are labeled `observed` or `estimated` and never presented as exact tokens.
- [ ] The inventory ranks `AGENTS.md`, session-start injection, invoked skill bodies, durable
      artifacts, prompts, tool payloads, and verification/review outputs by measured or estimated
      bytes while preserving each measurement label.
- [ ] Budgets use median plus 20% and deterministic rounding: token counts to the nearest upper
      thousand, output to the upper hundred, context proxies to the upper KiB, and turns/tool calls
      to the next integer. Unavailable values remain `null`.
- [ ] A committed baseline contains only sanitized aggregates, budgets, contributor ranking,
      environment metadata, and immutable hashes; it contains no prompts, responses, thread IDs,
      absolute paths, command output, stderr, or raw logs.
- [ ] Comparisons show deltas and budget status without blocking CI; token comparisons require the
      same model, reasoning effort, Codex version, and suite/scenario hashes, while elapsed-time
      comparisons additionally require the same operating system and architecture.
- [ ] Benchmark scenarios use temporary repositories and a deterministic fake `gh` on `PATH`; no
      scenario reads from or writes to real GitHub, and failed work remains available under the
      local raw-artifact directory.
- [ ] `record` refuses to create a baseline unless all five scenarios have the required successful
      samples and all six phase aggregates are present.

## Interface contracts

The benchmark is exposed by the dependency-free Node ESM entry point
`node scripts/benchmark-workflows.mjs`:

```text
validate
inventory
run --model <id> --reasoning <effort> [--scenario <id>]
record --run <summary> --baseline <path>
compare --baseline <path> --candidate <path>
```

`validate` checks that the five scenario manifests are present and coherent, the environment is
supported, the source tree is clean, and the managed local `plus-ultra-dev` snapshot is available.
Real runs require the local snapshot to have been installed or refreshed with
`node scripts/codex-local.mjs refresh`. `inventory` measures and sorts static and visible-output
contributors. `run` executes all scenarios or one selected scenario with explicit model and
reasoning settings. `record` accepts a complete run summary and writes only its sanitized baseline.
`compare` prints comparable deltas and budget status and exits without making CI a gate.

The canonical profile is model `gpt-5.6-sol` with reasoning `medium`. Codex is invoked through
`codex exec --json` with explicit model, reasoning, and sandbox settings. A run writes raw JSONL,
stderr, responses, and failed temporary repositories only below `.context/benchmarks/`.

The five declarative scenarios are:

1. **Product discovery** — establish a complete proposal and then record its explicit approval in
   `docs/product.md`.
2. **Spec creation/refinement** — produce the complete technical contract and then record its
   explicit approval.
3. **FAST implementation** — make a localized correction and run its focused test.
4. **STANDARD implementation** — implement a multi-file feature guided by a spec and TDD.
5. **PR review cycle** — review immutable head A with a known blocker, then re-review corrected
   immutable head B and record the resolution and updated summary.

Scenario 5 reports two independent phases, so the suite has exactly six phase classes. The fixture
is a compact dependency-free Node ESM reading-list CLI with deterministic Git history and
postcondition checks. The fake `gh` provides the Issue, PR, diff, comments, and threads needed by
the scenarios, logs expected local mutations, rejects unknown operations, and deletes only threads
created by this benchmark when cleanup is required. Approval-required turns are resumed explicitly;
unrelated scenarios continue after a failure.

Each phase produces metrics with this conceptual shape:

```text
Metric<T> = { value: T | null, label: "exact" | "observed" | "estimated" }

PhaseMeasurement = {
  phase: "product-discovery" | "spec-refinement" | "fast-implementation" |
         "standard-implementation" | "first-pr-review" | "pr-re-review"
  samples: SampleMeasurement[]
  aggregate: { input_tokens: Metric<number>, cached_input_tokens: Metric<number>,
               non_cached_input_tokens: Metric<number>, output_tokens: Metric<number>,
               reasoning_tokens: Metric<number>, turns: Metric<number>,
               item_types: Metric<string[]>, tool_call_types: Metric<string[]>,
               elapsed_ms: Metric<number>, visible_context_bytes: Metric<number> }
}
```

`turn.completed.usage` is the only source for exact usage fields, in accordance with the [official
Codex non-interactive mode documentation](https://learn.chatgpt.com/docs/non-interactive-mode).
Non-cached input is derived as `input_tokens - cached_input_tokens` only when both values exist and
is labeled `observed`; negative or otherwise inconsistent values are rejected. Event counts and
visible bytes measured directly from JSONL are `observed`; context-size estimates based on a proxy
are `estimated`. A metric that cannot be obtained is `null`, never a guessed token count.

The run identity includes the SHA-256 of each scenario manifest, prompt set, fixture, fake GitHub
responses, and their combined suite, plus the Git tree, plugin tree, Codex version, requested model,
and reasoning effort. A sanitized baseline has no local paths or model-generated content and keeps
only phase aggregates, budgets, contributor names/sizes/labels, hashes, and environment fields
needed for later comparison.

Budgets are calculated per workflow class as median aggregate value plus 20%. Use upper rounding to
the next 1,000 tokens, next 100 output tokens, next 1,024 context bytes, and next integer for
turns/tool calls. Keep `null` when the source metric is unavailable. Sampling uses two successful
measurements first; a third is required when the relative difference is strictly greater than
10%. If the median is zero, a non-zero difference requires the third sample; two zero values do
not. Failed samples do not become measurements or silently satisfy completeness.

Two token results are comparable only when model, reasoning effort, Codex version, suite hash, and
scenario hash agree. Elapsed time additionally requires equal operating system and architecture.
Mismatches are reported as environment drift and have no numeric delta. Comparison is informational
and does not block CI.

## Architecture boundaries

The benchmark core owns pure parsing, validation, aggregation, adaptive-sampling decisions,
budgeting, sanitization, hash construction, comparability, and contributor ranking. It has no
filesystem, process, network, Git, or GitHub dependency. It returns explicit result/error objects
for malformed JSONL, missing metrics, invalid manifests, and inconsistent samples.

The runner/CLI adapter owns temporary repository creation and cleanup, local snapshot validation,
Codex process execution, JSONL/stderr capture, fake-`gh` `PATH` setup, Git-tree inspection, and
writing raw or sanitized artifacts. The adapter must operate only in temporary fixture clones and
must preserve failed work under `.context/benchmarks/`; it must not invoke real GitHub. Benchmark
execution is manual and does not belong in hooks or CI.

Scenario manifests own immutable inputs and postconditions. The fixture owns deterministic behavior.
The fake `gh` owns the local representation of remote Issue/PR state and narrowly scoped thread
cleanup. Codex remains an external process boundary; no production telemetry adapter or hosted
service is introduced.

## Functional core

Parsing accepts JSONL event records and ignores unrelated valid events while rejecting malformed
JSON or structurally invalid usage records. Aggregation is immutable and computes medians without
mutating samples. Adaptive sampling is a deterministic decision using the strict 10% threshold.
Sanitization strips prompts, responses, command output, stderr, absolute paths, raw logs, and
thread IDs before a baseline can be written. Hashes are SHA-256 over canonicalized immutable inputs.
Contributor ranking is deterministic by descending size, then stable name order.

Process execution, temporary files, external commands, approval/resume turns, and cleanup remain
side effects behind injected adapter ports. Human approval is an explicit scenario input; a
successful validation or an agent recommendation cannot imply approval.

## Data model

Versioned benchmark inputs live under `benchmarks/` and include exactly five scenario manifests,
the fixture, prompts, and fake GitHub state. Raw run artifacts are unversioned local data below
`.context/benchmarks/<run-id>/`.

The durable baseline at `benchmarks/baselines/initial.json` contains a schema version, profile,
scenario and suite hashes, six sanitized `PhaseMeasurement` aggregates, per-class budgets, ranked
context contributors, and a minimal environment descriptor. It excludes all transient content and
identifiers listed in the Interface contracts section. No database, migration, runtime dependency,
or persistent hosted state is required.

## Test plan

- Unit-test valid and malformed JSONL, unrelated events, missing usage fields, cached-token
  subtraction, event/item/tool-call counts, elapsed and visible-byte observations, medians, and
  exact/observed/estimated/null labels.
- Test adaptive sampling below, exactly at, and above the 10% boundary, zero medians, failed
  samples, budget rounding, deterministic ranking, canonical hashes, sanitization, and all
  comparability/environment-drift rules.
- Integration-test fake Codex and fake `gh` executables for exact flags, resumed approval turns,
  narrowly scoped thread deletion, temporary-repository isolation, third samples, failed-run
  retention, postconditions, and refusal to record incomplete suites.
- Contract-test exactly five scenarios and six phase classes, deterministic fixture history, the
  product/spec approval turns, FAST and STANDARD outcomes, and the first-review blocker followed
  by re-review resolution.
- Run focused and full Node suites, `node scripts/benchmark-workflows.mjs validate`, packaging
  validation, both Claude plugin validations, clean temporary Codex installation, and
  `git diff --check` before commit. Baseline generation must verify no forbidden content is present.

## Risks

- Codex may omit usage fields or change JSONL event shape; retain `null`, label proxies explicitly,
  and fail validation rather than inventing tokens.
- Model, prompt, fixture, plugin, or environment drift can make a delta misleading; hashes and
  comparability checks must report drift and suppress numeric comparison.
- A third sample can increase benchmark cost; use the strict threshold and only available numeric
  metrics, and never run benchmark commands in normal workflow execution.
- A failed scenario or interrupted cleanup could leave temporary state; preserve it locally for
  diagnosis, refuse `record`, and delete only benchmark-created threads in the fake GitHub state.
- Sanitization can accidentally leak sensitive content; make the baseline writer allow-list fields,
  reject forbidden patterns, and keep raw artifacts out of Git.
- The contract is cooperative documentation plus tests, not a security boundary. Real GitHub access
  remains outside the benchmark's authority and must never be inferred from the fake adapter.

## Integration boundary

This approved contract authorizes implementation and review on a feature branch only. It does not
authorize merging, enabling auto-merge, pushing the default branch, publishing a release, or
creating a tag. The implementation agent may prepare a commit and review-ready branch; a human
owner performs any later integration manually after review.

