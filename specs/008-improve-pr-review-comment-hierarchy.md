---
title: Improve PR review comment hierarchy
status: approved
issue: 55
created: 2026-09-07
---

# 008 — Improve PR review comment hierarchy

## Problem

The canonical PR-review comment currently describes its contents without a stable, human-scannable
order. Reviewers and authors must work through findings and bookkeeping before understanding the
review verdict, while unanchorable findings and historical resolution data have no explicit visual
placement.

## Goals / Non-goals

**Goals**

- Define one verdict-first Markdown contract for the canonical tagged PR-review summary.
- Make the ready, changes-required, and limited-review states visible and unambiguous.
- Keep current findings and prior resolutions useful to people while moving exceptional bookkeeping
  into collapsible metadata.
- Remain compatible with the remote-head contract resolution in approved specs 002 and 003.

**Non-goals**

- Change PR-review invocation, GitHub endpoints, stable markers, finding severity semantics,
  deduplication, inline anchoring, or review-thread resolution.
- Add a renderer, a new persisted data model, commands, hooks, manifests, or agent-specific logic.
- Change the approved contract-selection precedence or accepted limited-review workflow from specs
  002 and 003.

## Acceptance criteria

- [x] The portable PR-review skill declares a canonical summary beginning with the existing stable
      summary marker and the exact emoji-free title `# Plus Ultra PR Review`.
- [x] The summary displays exactly one verdict: `✅ Ready` for no findings or only non-blocking
      findings, `⛔ Changes required` for one or more blockers, or `⚠️ Limited review` for an
      accepted no-contract review.
- [x] A limited review visibly includes `Spec: none` and the exact phrase `limited review; no
      contractual verdict`, and never presents itself as ready.
- [x] Visible findings are grouped only by severities that have findings; empty severities are
      omitted, and unanchorable findings remain in their visible severity group as `summary-only`.
- [x] The summary includes a compact Issue, Spec, Contract table; prior resolutions appear only
      when present and use human-first descriptions. An approved legacy contract without `issue:`
      renders `none`, its approved spec path, and `Contractual review`, remaining distinct from
      the all-`none` `Limited review` row.
- [x] Evidence and Metadata use `<details>` blocks. IDs, SHAs, duplicate-thread references, and
      counts are metadata-only and omitted when empty.
- [x] The canonical-comment update, deduplication, inline-comment, and thread-resolution workflows
      remain unchanged.
- [x] README documentation briefly describes the verdict-first review summary, and regression tests
      validate the contract without weakening earlier review behavior.

## Interface contracts

The sole public interface change is the canonical Markdown body posted through the existing
`issues/comments` workflow. It uses the existing marker and the following ordered visible shape:

```markdown
<!-- plus-ultra:pr-review:summary -->
# Plus Ultra PR Review
## Status
## Findings
| Issue | Spec | Contract |
## Resolutions from the previous review  <!-- only when present -->
<details><summary>Evidence</summary>...</details>
<details><summary>Metadata</summary>...</details>
```

The existing `pr-review` invocation forms, `pulls/{pull_number}/comments` inline-comment endpoint,
`issues/comments` canonical-summary endpoint, `resolveReviewThread` mutation, and marker strings
remain unchanged. This is compatible with spec 002's approved Issue–Spec traceability and spec
003's approved remote-head selection and no-contract flow.

## Architecture boundaries

`skills/pr-review/SKILL.md` remains the portable source of truth for comment shape and for existing
GitHub review operations. `README.md` provides concise user-facing discovery only. The Claude-only
command and reviewer agent, hooks, manifests, and GitHub APIs are outside this change, preserving
the portability boundary used by specs 002 and 003.

## Functional core

The summary shape is a deterministic projection of an already-completed review: verdict, visible
findings, traceability, optional resolutions, evidence, and exceptional metadata. Verdict selection
uses existing severity and contract results: blockers select Changes required; otherwise a
contractual review selects Ready; and the existing explicitly accepted no-contract path selects
Limited review. GitHub reads and mutations remain adapters governed by the unchanged workflow.

## Data model

No persisted schema or API type changes. The canonical Markdown comment continues to carry:

```text
marker, verdict, findings, Issue/Spec/Contract traceability, optional resolutions, evidence, metadata
```

An approved legacy contract without `issue:` uses `none | specs/<path> (approved) | Contractual
review`; the accepted no-contract path instead uses `none | none | Limited review`.

Internal IDs, head SHAs, duplicate-thread references, and counts are optional metadata rather than
visible review content.

## Test plan

- Verify the portable skill specifies the exact title and each verdict, including Ready with no
  findings and with non-blocking findings, blockers requiring Changes required, and limited review
  with `Spec: none` and the exact no-contract verdict.
- Verify canonical ordering, present-severity-only findings, visible `summary-only` unanchorable
  findings, conditional human-first resolutions, and bounded Evidence/Metadata bookkeeping.
- Preserve existing tests for deterministic contract selection, remote-head evidence, canonical
  update, deduplication, inline anchoring, and thread resolution.
- Run `node --test tests/skills.test.mjs`, `node --test tests/*.test.mjs`, and `git diff --check`.

## Risks

The new template could accidentally expose implementation identifiers or imply a contractual
approval during a no-contract review. Keeping such bookkeeping in optional Metadata and prescribing
the limited-review phrase mitigates both risks. Changing the template without preserving its stable
marker could create duplicate canonical comments; retaining that marker and the existing
update-selection workflow avoids this compatibility risk.
