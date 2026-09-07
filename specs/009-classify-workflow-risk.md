---
title: Classify workflow risk
status: approved
issue: 23
created: 2026-09-07
---

# 009 — Classify workflow risk

## Problem

The plugin has no portable, shared way to choose FAST, STANDARD, or CRITICAL workflow rigor. That
leaves agents to make inconsistent choices, especially when a change grows between initial planning
and pre-ship review.

## Goals / Non-goals

**Goals**

- Define the portable `workflow-risk` skill's exact levels, phases, dimensions, output, precedence,
  baseline rigor, and per-dimension controls.
- Preserve monotonic pre-ship classification unless a visible explicit override says otherwise.
- Make the skill discoverable while keeping Issue #22, #26, and #35 ownership boundaries clear.

**Non-goals**

- Add orchestration, persistence, commands, hooks, manifests, Semgrep execution, or agent-specific
  mechanics.
- Classify UI impact beyond its effect on FAST eligibility.

## Acceptance criteria

- [x] `skills/workflow-risk/SKILL.md` is portable, has `workflow-risk` frontmatter, and begins its
      description with `Use when`.
- [x] The contract defines exactly FAST, STANDARD, CRITICAL; initial and pre-ship; and the nine
      named risk dimensions.
- [x] Its output includes phase, prior/suggested/effective levels, detected/new dimensions,
      evidence, required verification, and explicit override.
- [x] It gives CRITICAL, FAST, STANDARD, monotonic pre-ship, accumulated-dimension, override, and
      missing-prior precedence rules.
- [x] It defines FAST, STANDARD, and CRITICAL rigor plus the de-duplicated per-dimension union.
- [x] It covers every specified per-dimension verification control and treats Semgrep as conditional
      execution owned by Issue #26.
- [x] Significant UI impact blocks FAST but creates no critical dimension; Issue #35 retains UI
      classification ownership and Issue #22 retains orchestration/persistence ownership.
- [x] README discovery and contract tests cover all required classification scenarios without
      introducing commands, hooks, or state.

## Interface contracts

The portable conceptual interface is:

```text
WorkflowLevel = FAST | STANDARD | CRITICAL
Phase = initial | pre-ship
RiskDimension = authentication | authorization | security-boundary | payments |
                database-migration | destructive-data | concurrency |
                persistence-integrity | critical-infrastructure
```

Each classification reports phase, prior level, suggested level, effective level, detected/new
dimensions, evidence, required verification, and explicit override. A known critical trigger is
CRITICAL. FAST requires proving every restriction. All other changes—including uncertainty without
critical evidence—are STANDARD. At pre-ship use the maximum of prior and current classification and
accumulate dimensions. An explicit visible override is the sole way to lower a level or remove a
dimension, and cannot disable baseline guardrails.

## Architecture boundaries

`skills/workflow-risk/SKILL.md` is the portable policy source. `README.md` is discovery-only and
`tests/skills.test.mjs` checks the documented contract. Issue #22 may orchestrate or persist this
result later; Issue #26 may execute Semgrep later; Issue #35 exclusively classifies UI. No adapter,
command, hook, manifest, persistence store, or agent-specific implementation is part of this work.

## Functional core

Classification is a pure, explainable decision: identify dimensions and evidence, select the current
level using precedence, then combine it with prior classification at pre-ship. Verification is a
deduplicated union of baseline rigor and dimension controls. Any override is an explicit input that
remains in the output rather than an implicit mutation of the result.

## Data model

No persisted schema is introduced. The conceptual result fields are:

```text
phase, priorLevel, suggestedLevel, effectiveLevel, detectedNewDimensions,
evidence, requiredVerification, explicitOverride
```

## Test plan

- Add contract tests before the skill exists and observe the expected missing-file failure.
- Verify discovery, frontmatter, exact vocabulary, precedence, FAST guardrails, initial/pre-ship
  output, monotonic escalation, dimension accumulation, explicit overrides, unioned controls, UI
  separation, Semgrep delegation, spec linkage, and README boundaries.
- Cover FAST-localized, ambiguous STANDARD, one/multiple CRITICAL, FAST→STANDARD,
  STANDARD→CRITICAL, retained-prior, explicit-override, and missing-prior scenarios.
- Run focused skills tests, the full test suite, package validation, Claude validation, and
  whitespace validation before committing.

## Risks

A reader could treat a heuristic as hidden automation, downgrade a pre-ship change from a smaller
diff, or duplicate work owned by adjacent issues. The visible output, explicit override rule,
monotonic pre-ship rule, and ownership boundaries mitigate those risks. This documentation-only
contract can be revised through a later approved spec if practical execution reveals a gap.
