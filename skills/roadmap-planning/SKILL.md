---
name: roadmap-planning
description: Use when a roadmap brief or GitHub issue needs to be broken into milestones, epics, and executable stories.
---

# Plan a GitHub Issues roadmap

Accept a roadmap brief or an existing issue. If an issue is supplied, read it before planning. Follow
`plus-ultra:issue-management` for taxonomy, repository access, and mutation safety.

## Durable product context

When `docs/product.md` exists, read it as product context before decomposition. Use its MVP
hypothesis, core user journeys, non-goals, and success criteria to bound milestones, epics, and
stories. A repository without a brief remains compatible: continue planning normally and never
create, edit, write, or mutate `docs/product.md` implicitly.

If proposed roadmap work creates a durable contradiction with a present brief, pause the current
workflow, invoke `$product-discovery` for a focused rediscovery update; only after its explicit
human approval, resume the current workflow. This workflow only consumes the approved brief; it does not resolve a
strategic conflict itself.

## Decompose before writing

Propose one Milestone, then a tree of Epics and independent Stories. Every Story must state its
outcome-oriented title, context, acceptance criteria, and dependencies. Keep cross-epic ordering in
the dependency text; GitHub sub-issues express ownership, not scheduling.

Show the complete tree and a mutation list: labels to create, milestone to create or reuse, each
epic and story, labels, milestone assignments, and parent-child links. Do not create anything until
the user gives **explicit confirmation** of that complete proposal.

After confirmation, create or reuse labels and the milestone, then create epics and stories with
`gh issue create`, passing title, body, labels, and milestone. GitHub CLI v2.94.0 introduced native
hierarchy operations: detect `--parent` in `gh issue create --help` and `--add-sub-issue` in
`gh issue edit --help` rather than parsing the installed version.

Create each story with `gh issue create --parent <parent>` when that capability is available. If
`--parent` is absent, create the story with `gh issue create`, then attach it with
`gh issue edit <parent> --add-sub-issue <child>` when that capability is available. If the needed
native capability is absent, look up the parent and child node IDs and use GraphQL `addSubIssue` as
the hierarchy fallback only.
Report all created URLs and any operation that failed. Do not invent dates, assignees, estimates, or
priorities; include them only when the user supplied them.
