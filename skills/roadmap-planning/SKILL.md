---
name: roadmap-planning
description: Use when a roadmap brief or GitHub issue needs to be broken into milestones, epics, and executable stories.
---

# Plan a GitHub Issues roadmap

Accept a roadmap brief or an existing issue. If an issue is supplied, read it before planning. Follow
`plus-ultra:issue-management` for taxonomy, repository access, and mutation safety.

## Decompose before writing

Propose one Milestone, then a tree of Epics and independent Stories. Every Story must state its
outcome-oriented title, context, acceptance criteria, and dependencies. Keep cross-epic ordering in
the dependency text; GitHub sub-issues express ownership, not scheduling.

Show the complete tree and a mutation list: labels to create, milestone to create or reuse, each
epic and story, labels, milestone assignments, and parent-child links. Do not create anything until
the user gives **explicit confirmation** of that complete proposal.

After confirmation, create or reuse labels and the milestone, then create epics and stories with
GraphQL `createIssue` and `parentIssueId`; use `addSubIssue` only for pre-existing issues. Report
all created URLs and any operation that failed. Do not invent dates, assignees, estimates, or priorities; include them only when the user supplied them.
