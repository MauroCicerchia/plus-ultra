---
name: refine-issues
description: Use when a person-created GitHub issue needs a structured, reviewable implementation brief before work begins.
---

# Refine GitHub issues

Accept one positive **issue number**. Read the issue, its labels, milestone, parent, and relevant
repository context. Follow `plus-ultra:issue-management` for repository access and mutation safety.

## Durable product context

When `docs/product.md` exists, read it as product context and check whether the proposed story fits
the approved direction. A repository without a brief remains compatible: continue refinement
normally and never create, edit, write, or mutate `docs/product.md` implicitly.

If the proposed story creates a durable contradiction with a present brief, pause the current
workflow, invoke `$product-discovery` for a focused rediscovery update; only after its explicit
human approval, resume the current workflow. This workflow consumes the brief read-only and does not make the
strategic decision itself.

## Proposal

Classify the issue as a story or epic from its scope, then show a proposed title, labels, milestone,
and parent only when each is supported by the available context. Replace the body only with this
reviewable structure:

```markdown
## Context

## Goal

## Scope
### In
### Out

## Acceptance Criteria

## Dependencies

## Risks
```

Keep uncertain facts as explicit questions, not invented requirements. Do not edit the issue, add
labels, assign a milestone, or create a parent-child relation until the user gives **explicit confirmation**
for the displayed proposal. On confirmation, make only those edits and report the
updated issue URL; GitHub's edit history remains the record of the original intake.

After reporting the updated Issue URL, suggest `plus-ultra:spec new --issue <number>` to create a
separate durable technical contract. Do not create, link, or edit any spec as part of refinement.
