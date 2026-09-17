---
title: Make plans, handoffs, and orchestration token-aware
status: approved
issue: 67
created: 2026-09-17
---

# 015 — Make plans, handoffs, and orchestration token-aware

## Problem

Planning, implementation, verification, and review can each repeat product, Issue, contract,
plan, diff, and prior-agent content even when that information has an authoritative durable source.
This raises context cost and makes resumed work depend on conversational memory. Future orchestration
must reuse the smallest sufficient evidence without weakening risk controls.

## Goals / Non-goals

**Goals**

- Add a portable `plus-ultra:context-handoffs` skill that defines compact, reference-first handoffs
  for planner, implementer, verifier, and reviewer transitions.
- Require source paths plus immutable revisions, focused scope, open decisions, and only the
  phase-specific evidence needed to resume work.
- Define FAST, STANDARD, and CRITICAL context-depth expectations that consume the existing
  `plus-ultra:workflow-risk` classification without changing its ownership.
- Update planning, verification, and PR-review guidance to use the contract and existing compact
  review metadata selectively.
- Keep the new skill core within a 2 KiB enforced context budget and retain detailed procedures in
  an on-demand reference.

**Non-goals**

- Add feature/ship orchestration, workflow-state persistence, commands, hooks, or platform-specific
  agent mechanics; Issue #22 owns orchestration and persistence.
- Create a local receipt or versioned handoff manifest.
- Reimplement workflow-risk classification, compact PR reducers, review safety controls, or
  verification execution.
- Change benchmark scenarios, prompts, the committed baseline, or make benchmark comparison a CI
  gate.
- Merge, enable auto-merge, publish, tag, or release.

## Acceptance criteria

- [ ] `skills/context-handoffs/SKILL.md` is portable, uses `context-handoffs` frontmatter with a
      `Use when` description, and has a core no larger than 2 KiB.
- [ ] The contract defines a compact handoff containing phase, FAST/STANDARD/CRITICAL rigor, source
      commit SHA, Issue/product/spec/plan/design references with immutable revisions, focused
      scope, verification receipt references, and open decisions.
- [ ] Tracked artifacts use their Git blob SHA; untracked local artifacts use a SHA-256 content
      digest. Missing artifacts are explicitly `none`, never copied into the handoff by default.
- [ ] The planner, implementer, verifier, and reviewer contracts identify their minimum sources and
      exclude irrelevant transcripts, prior reasoning, broad logs, or complete artifacts unless an
      expansion trigger applies.
- [ ] Missing or stale references, revision mismatch, unresolved decisions, scope growth, risk
      escalation, failed or unknown verification, and contract/dependency ambiguity deterministically
      require selective expansion.
- [ ] FAST limits discovery and evidence to the proven localized scope; STANDARD uses normal scoped
      artifacts; CRITICAL adds all controls required for detected risk dimensions. No level bypasses
      baseline guardrails or silently lowers rigor.
- [ ] Resumed work reconstructs the handoff from the current durable sources and immutable revisions;
      no conversational-memory or handoff-state file is required.
- [ ] `spec-conventions`, `workflow-risk`, verification guidance, and PR-review operations consume
      the contract while retaining their current ownership boundaries; PR review continues to use
      the optional local compact reducer and expands only identified remote evidence.
- [ ] README and maintainer documentation describe the contract and its boundaries with #22, #23,
      #63, and #64 without platform-specific instructions in portable skills.
- [ ] Contract and budget tests cover the new skill; existing deterministic checks remain green.

## Interface contracts

The portable handoff is a compact, ephemeral message with this conceptual shape:

```text
Handoff = {
  phase: planner | implementer | verifier | reviewer,
  rigor: FAST | STANDARD | CRITICAL,
  source: { commit: <Git commit SHA>, base?: <Git commit SHA>, head?: <Git commit SHA> },
  issue: <URL or #number or none>,
  product: <path @ revision or none>,
  spec: <path @ revision or none>,
  plan: <path @ revision or none>,
  design: <path @ revision or none>,
  scope: <focused paths, sections, or remote evidence identifiers>,
  verification: <receipt references or none>,
  open_decisions: <explicit list or none>
}
```

`revision` is the artifact's Git blob SHA when tracked at the identified source commit, otherwise
`sha256:<content-digest>` for an untracked local artifact. Artifact bodies, conversation transcripts,
raw patches, and broad logs do not appear in the handoff. A receiving phase resolves and checks the
referenced source before use.

The phase minimums are:

| Phase | Required references | Excluded by default |
| --- | --- | --- |
| planner | Issue, present product brief, relevant architecture, risk classification | prior test logs and implementation reasoning |
| implementer | approved spec, implementation plan, risk classification, focused files/design | planning transcript and unrelated repository map |
| verifier | source snapshot, required commands and risk controls, focused receipts | product-discovery history and implementation rationale |
| reviewer | approved contract, immutable remote diff metadata, verification evidence, existing finding metadata | implementer chain of thought and unneeded comment bodies |

## Architecture boundaries

`context-handoffs` owns only portable handoff policy and selective-reading rules. Its operations
reference owns the detailed templates, phase matrix, digest guidance, and expansion examples.
`workflow-risk` remains the source for classifying rigor and risk dimensions. `spec-conventions`
remains the source for durable-spec and local-plan locations. Verification remains the source for
command receipts, while PR review retains remote-head freshness, contract resolution, finding, and
publication rules. The existing local context reducer remains repository-local and optional.

Issue #22 may later orchestrate or persist these references, but this change creates neither an
orchestrator nor persisted workflow state. Issues #63 and #64 remain the sources for progressive
disclosure and compact deterministic PR metadata respectively.

## Functional core

The contract is documentation policy, not a runtime API. Its deterministic decisions are: keep only
the required references for the declared phase and rigor; validate their revision before relying on
them; and selectively expand when a listed trigger occurs. It never substitutes a summary for an
authoritative artifact, assumes a missing reference is current, or uses a smaller diff to lower
workflow rigor.

## Data model

There is no new persisted data model. Handoffs are ephemeral text and point to existing versioned
sources (`specs/`, Git commits, remote PR metadata) or existing unversioned local artifacts
(`.context/superpowers/` plans and `.context/plus-ultra/verification/` receipts). The referenced
paths retain ownership of their content and lifecycle.

## Test plan

- Add contract tests before the new skill exists, observe the missing-contract failure, then test
  frontmatter, discovery, compact fields, revision rules, all four phase minimums, exclusions,
  expansion triggers, rigor levels, baseline guardrails, resumption, and ownership boundaries.
- Add the 2 KiB `context-handoffs` entry to the context-budget helper and verify an over-limit skill
  is reported alongside the existing entries.
- Test the consumer guidance for `spec-conventions`, `workflow-risk`, verification, and PR review,
  including optional reducer use and evidence-only expansion.
- Run focused contract and context-budget tests, `node --test tests/*.test.mjs`,
  `node scripts/check-context-budget.mjs`, `node scripts/validate-packaging.mjs`, both Claude
  plugin validations, and `git diff --check`.
- Manually run the existing matched PR re-review A/B probe with control and candidate artifacts
  retained only under `.context/`; report the measured reduction and any review regression without
  committing a baseline or creating a CI gate.

## Risks

Over-minimizing a handoff can hide a material constraint. Revision checks and deterministic
expansion triggers require the receiver to load additional authoritative evidence whenever safety
or relevance is uncertain. The compact template could grow into hidden orchestration or a cache;
the ownership boundaries, no-persistence rule, and context budget prevent that drift. A lower token
result alone is insufficient: verification and review regressions remain blockers for adopting the
convention.

## Integration boundary

This approved contract authorizes implementation and review on a feature branch only. It does not
authorize merging, enabling auto-merge, pushing the default branch, publishing, or tagging. An
implementation agent may prepare a feature-branch commit and review-ready pull request, then must
stop for human integration.
