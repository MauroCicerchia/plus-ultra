---
name: context-handoffs
description: Use when passing planning, implementation, verification, or review work to another agent or resuming it from durable sources.
---

# Context handoffs

Pass references, not copied artifacts. Reconstruct a resumed handoff from current authoritative
sources; never depend on conversation memory or create handoff state.

## Compact handoff

```text
phase: planner | implementer | verifier | reviewer
rigor: FAST | STANDARD | CRITICAL
source: commit <SHA>; base/head <SHA or none>
issue, product, spec, plan, design: <path @ revision | none>
scope: <paths, sections, or remote evidence identifiers>
verification: <receipt references | none>
open_decisions: <explicit list | none>
```

Use a tracked artifact's Git blob SHA at the source commit; use `sha256:<digest>` for an untracked
local artifact. Do not put artifact bodies, transcripts, raw patches, or broad logs in this header.

## Read only what the phase needs

Read the phase matrix and expansion rules in
[handoff operations](./references/handoff-operations.md). Check every referenced revision before
reuse and expand only the evidence that a listed trigger requires.

## Rigor and boundaries

Consume the explainable classification from `plus-ultra:workflow-risk`; do not classify or lower
rigor here. FAST is localized, STANDARD is normally scoped, and CRITICAL adds the controls required
by detected risk dimensions. Every level retains baseline guardrails.

Issue #22 owns orchestration and persistence. This skill does not add commands, hooks, platform
mechanics, agents, caches, manifests, or durable workflow state.
