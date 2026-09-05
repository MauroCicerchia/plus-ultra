---
name: refine-issues
description: Use when a person-created GitHub issue needs a structured, reviewable implementation brief before work begins.
---

# Refine GitHub issues

Accept one positive **issue number**. Read the issue, its labels, milestone, parent, and relevant
repository context. Follow `plus-ultra:issue-management` for repository access and mutation safety.

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
