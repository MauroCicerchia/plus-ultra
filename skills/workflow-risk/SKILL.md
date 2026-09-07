---
name: workflow-risk
description: Use when classifying implementation workflow risk at the start of work or before shipping a change.
---

# Workflow risk

Use this portable contract to classify the rigor appropriate for a change. It defines a
recommendation only: it has no commands, hooks, or state, and does not run orchestration.
Issue #22 owns orchestration and persistence; Issue #26 owns Semgrep execution; Issue #35 owns UI
classification.

## Conceptual types

```text
WorkflowLevel = FAST | STANDARD | CRITICAL
Phase = initial | pre-ship
RiskDimension =
  authentication | authorization | security-boundary | payments |
  database-migration | destructive-data | concurrency |
  persistence-integrity | critical-infrastructure
```

## Standard output

Always report a plain, reviewable classification containing:

```text
phase: initial | pre-ship
prior level: FAST | STANDARD | CRITICAL | missing
suggested level: FAST | STANDARD | CRITICAL
effective level: FAST | STANDARD | CRITICAL
detected/new dimensions: <deduplicated RiskDimension list>
evidence: <observations, assumptions, and uncertainty>
required verification: <baseline rigor plus dimension controls>
explicit override: <none, or who/what explicitly changes level or dimensions>
```

At `initial`, effective level normally equals the suggested level. At `pre-ship`, preserve the
classification history: effective level is the maximum of prior and current classification, and
dimensions accumulate. Missing prior classification must not silently infer a downgrade; say so.
Only an explicit override may lower a level or remove dimensions. Keep that override
visible, and never use it to disable baseline guardrails.

## Classification precedence

Apply these rules in order:

1. A known critical trigger in any RiskDimension produces `CRITICAL`.
2. Suggest `FAST` only after proving every restriction: the change is small and localized, has no
   significant UI impact, introduces no critical dimension, is understood rather than ambiguous,
   and has focused verification.
3. Every other change, including uncertainty without critical evidence, is `STANDARD`.
4. At `pre-ship`, effective level is the maximum of prior and current classification, even if the
   current diff is smaller; dimensions accumulate.
5. Only an explicit override may lower a level or remove dimensions; keep the override visible and
   do not disable baseline guardrails.
6. Missing prior classification at `pre-ship` must not silently infer a downgrade.

Significant UI impact prevents `FAST` but never creates a critical dimension. Leave UI
classification exclusively to Issue #35; do not invent a UI RiskDimension.

## Baseline rigor

### FAST

Require a small, localized change and focused verification. Commit guardrails remain in force;
optional review is permitted and no required durable artifact is created.

### STANDARD

Use the normal Issue, design, or spec process as applicable; write a plan; use TDD; run the
relevant suite; obtain review; and prepare a PR.

### CRITICAL

Require all STANDARD requirements, an approved spec, and mandatory review. Also require the
de-duplicated union of controls for every detected/new dimension.

## Per-dimension controls

### authentication

Test permitted and denied cases across sessions, roles, and tenancy; use integration coverage and
security review.

### authorization

Test permitted and denied cases across sessions, roles, and tenancy; use integration coverage and
security review.

### security-boundary

Exercise abuse cases and trust-boundary validation. Run Semgrep when available; its execution and
availability handling belong to Issue #26.

### payments

Test idempotency, retries, duplicates, amounts, currencies, rounding, and reconciliation.

### database-migration

Use representative fixtures; verify compatibility, roll-forward, rollback, and data safety.

### destructive-data

Verify authorization and confirmation, scope, recovery, and partial failures.

### concurrency

Test races, ordering, retries, and concurrent integration behavior.

### persistence-integrity

Test atomicity, invariants, restarts, idempotency, and partial failures.

### critical-infrastructure

Verify configuration and permissions, integration, degradation, recovery, and rollback.

## Worked classification scenarios

- **FAST-localized change:** A small, localized, one-file copy correction with focused verification,
  no UI impact, no critical trigger, and all FAST restrictions proven is FAST.
- **Ambiguous STANDARD:** An incompletely understood change without critical evidence is STANDARD.
- **One CRITICAL dimension:** A tenancy authorization change is CRITICAL and includes the
  authorization controls.
- **Multiple CRITICAL dimensions:** A payment migration is CRITICAL and requires the de-duplicated
  union of payments and database-migration controls.
- **FAST→STANDARD:** A previously localized change that expands beyond a FAST restriction becomes
  STANDARD at pre-ship.
- **STANDARD→CRITICAL:** A standard change that exposes a known security-boundary trigger becomes
  CRITICAL at pre-ship.
- **Smaller diff retaining prior level:** A smaller pre-ship diff after a CRITICAL prior level
  remains CRITICAL and retains prior dimensions.
- **Explicit override:** Record an explicit override that lowers a level or removes dimensions;
  keep it visible and retain baseline guardrails.
- **Missing prior classification:** At pre-ship with no known critical evidence or trigger, report
  missing prior classification; classification remains STANDARD and does not infer a silent
  downgrade. Any known critical trigger remains CRITICAL despite missing prior history.
