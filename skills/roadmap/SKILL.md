---
name: roadmap
description: Use when turning a product brief or a rough plan into GitHub Epics and Stories that are ready to refine and implement.
---

# Roadmap

Turn product direction into GitHub Issues that can actually be picked up. GitHub Issues are the
source of truth for work; do not introduce Projects or a tracker MCP.

Read `docs/product.md` when it exists and bound the roadmap by its MVP hypothesis, core journeys,
and non-goals. If the proposed roadmap contradicts the brief, say so and ask before planning around
it.

## Scope of a first roadmap

Plan enough to start, not everything. A reasonable MVP slice with room to refine later beats an
exhaustive backlog that will be wrong by the third Story.

Default shape is **Epic → Stories**. Add a Milestone only when it represents a real release or
horizon the user named; otherwise leave milestones out entirely.

## Taxonomy

| Group | Label | Color | Meaning |
| --- | --- | --- | --- |
| type | `type:epic` | `#8250df` | Initiative containing stories |
| type | `type:story` | `#1f6feb` | Executable unit of work |
| status | `status:ready` | `#bf8700` | Ready to start |
| status | `status:blocked` | `#cf222e` | Cannot progress without a resolution |
| priority | `priority:high` | `#cf222e` | Highest delivery priority |
| priority | `priority:low` | `#1a7f37` | Lower delivery priority |

`status` and `priority` are optional and mutually exclusive namespaces: setting one replaces any
other label in the same group. An open Issue with no status label is simply not started; a closed
Issue is done. Do not add a competing "done" label.

## Propose, then create

1. Follow `plus-ultra:conventions` for the required `gh` version, then run `gh auth status` and
   check the repository's `viewerPermission`. Stop without writing unless it is `WRITE`,
   `MAINTAIN`, or `ADMIN`.
2. Decompose before writing anything. Every Story needs an outcome-oriented title, context,
   acceptance criteria, and its dependencies. Cross-epic ordering lives in the dependency text;
   sub-issue links express ownership, not scheduling.
3. Show the complete tree **and** the full mutation list: labels to create, any milestone, each
   Epic and Story, and each parent-child link.
4. Wait for **explicit confirmation** of that complete list. Create nothing before it.
5. Create missing labels with `gh label create --color <color> --description <description>`; never
   `--force` over an existing label. Create Stories with `gh issue create --parent <parent>`, or
   attach an existing one with `gh issue edit <parent> --add-sub-issue <child>`.
6. Report every created URL and every operation that failed. Stop on an unexpected write failure
   instead of retrying silently.

Never invent dates, assignees, estimates, or priorities. Ask for the value or leave it out.

Hand each new Story to `plus-ultra:refine-issue` before implementation.
