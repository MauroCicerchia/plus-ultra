---
title: Make verification output token-efficient by default
status: approved
issue: 65
created: 2026-09-16
---

# 013 — Make verification output token-efficient by default

## Problem

Successful deterministic checks often produce large logs with little decision value. Agents need a
compact trustworthy result, while warnings and failures still need enough evidence to diagnose and
prove the exact source state that was checked.

## Goals / Non-goals

**Goals**

- Provide a dependency-free, project-local Node ESM wrapper at
  `scripts/plus-ultra-verify.mjs` with the portable command interface
  `node scripts/plus-ultra-verify.mjs <label> -- <command> [args…]`.
- Bound clean, warning, failure, and unknown-state output while retaining receipts and relevant raw
  logs below `.context/plus-ultra/verification/`.
- Keep valid `test` and `typecheck` results tied to an unchanged, computable Git source state.
- Ship the wrapper template, portable verification guidance, scaffold support, and a deterministic
  #62 A/B measurement of visible bytes.

**Non-goals**

- Parse compiler output as authoritative diagnostics, replace a project's test runner, or proxy
  arbitrary `git` or `gh` commands.
- Relax stale-verification protection, add runtime dependencies, hosted telemetry, or agent-cache
  dependencies for consumer projects.
- Merge, enable auto-merge, publish, tag, or release.

## Acceptance criteria

- [ ] Labels are lowercase slugs; `test` and `typecheck` are recognized verification categories.
- [ ] A clean pass prints one summary no larger than 1 KiB; warnings include at most 20 lines / 8
      KiB; failures and unknown results include at most 80 lines / 16 KiB and exit non-zero.
- [ ] Each execution writes a JSON receipt recording argv, duration, exit outcome, detected
      warning/error counts, source state before and after, and any retained log path. Complete logs
      are kept only for warnings, failures, and unknown results.
- [ ] A pass is valid only when source state is captured and unchanged throughout execution;
      unavailable Git, capture errors, interrupted commands, and drift never yield a valid pass.
- [ ] `test-marker` recomputes the current fingerprint before recognizing a wrapped successful
      `test` or `typecheck`; `commit-gate` continues to reject missing or stale results.
- [ ] `plus-ultra:verification` documents local installation, use, receipts, output limits, and
      bounded opt-in Git/GitHub inspection without platform roots or hook mechanics.
- [ ] New-project scaffolding copies the template into generated projects, and existing-project
      guidance requires a checked-in copy rather than a plugin-cache reference.
- [ ] The #62 harness measures direct versus wrapped output for the same deterministic verification
      without weakening the five canonical scenario comparability rules.

## Interface contracts

The wrapper accepts exactly one label, `--`, then an executable and optional arguments. It rejects
invalid invocations without claiming verification. Labels match lowercase slug syntax. `test` and
`typecheck` carry the recognized categories; all other valid labels remain available for checks such
as lint, build, and packaging.

Each result has a compact human-facing summary and a receipt:

```text
VerificationReceipt = {
  version, label, argv, startedAt, durationMs, outcome, verified,
  process: { exitCode, signal, captureError },
  diagnostics: { warningsDetected, errorsDetected },
  source: { before, after, stable },
  output: { stdoutBytes, stderrBytes, fullLogBytes, visible },
  log
}
```

`outcome` distinguishes clean pass, warning, failure, and unknown. Detection is heuristic and is
reported as detected counts, not compiler truth. The source state includes all changes relevant to
the existing stale-verification guard. A result can be valid only for an unchanged captured state.

## Architecture boundaries

The wrapper owns argument validation, child-process capture, output selection, receipt/log policy,
and Git-state capture. Pure helpers classify labels and outcomes, calculate byte/line excerpts, and
decide pass validity from immutable observations. Process execution, filesystem writes, timestamps,
and Git calls remain side-effect adapters.

The hook marker consumes only a completed wrapped command and independently recomputes its current
fingerprint; it does not trust a claimed pass. Existing commit gating remains the authority that
rejects no-result and stale-result commits. The verification skill owns portable usage guidance;
the scaffold owns copying the template; the benchmark owns deterministic A/B measurement.

## Data model

Receipts and retained logs are local, unversioned artifacts below
`.context/plus-ultra/verification/`. Clean passes retain their receipt but not a full raw log.
Consumer repositories version only their local wrapper copy. No database, migration, network
service, or package dependency is introduced.

## Test plan

- Unit- and integration-test CLI grammar, label validation, exit codes, output caps, receipts,
  retained-log policy, warning/error detection, interruption, capture errors, missing Git, and
  source drift.
- Test hook recognition for wrapped `test` and `typecheck`, including fresh, staged, unstaged, and
  untracked source changes, without weakening commit-gate behavior.
- Contract-test the portable skill, template packaging, scaffold copy, existing-project setup, and
  absence of agent/platform roots in portable guidance.
- Test the deterministic A/B probe's visible-byte reduction and preserve benchmark validation for
  all five canonical scenarios.
- Run focused and full Node suites, context-budget and packaging validation, both Claude plugin
  validations, and `git diff --check` before commit.

## Risks

Filtering can hide material evidence or a state race can create a false pass. Strict caps must keep
the most useful failure excerpt, receipts must point to retained logs, and unknown/capture/drift
states must fail closed. Heuristic warning/error counts can be imperfect, so the receipt labels them
as detected rather than authoritative diagnostics.

## Integration boundary

This approved contract authorizes implementation and review on a feature branch only. It does not
authorize merging, enabling auto-merge, pushing the default branch, publishing a release, or
creating a tag. A human owner performs any later integration manually after review.
