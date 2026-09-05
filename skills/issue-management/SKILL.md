---
name: issue-management
description: Use when creating, organizing, linking, or reporting GitHub milestones, epics, and stories with the gh CLI.
---

# GitHub issue management

Use GitHub Issues as the source of truth. A **Milestone** is a release or roadmap horizon; an
**Epic** is an issue labelled `type:epic`; a **Story** is an executable sub-issue labelled
`type:story`. Do not use GitHub Projects or an MCP for this workflow.

## Taxonomy

Inspect this deterministic label set before proposing work. Create only absent labels after confirmation;
never use `--force` to rewrite metadata on an existing label.

| Group | Label | Color | Description |
| --- | --- | --- | --- |
| type | `type:epic` | `#8250df` | Product initiative containing stories |
| type | `type:story` | `#1f6feb` | Executable unit of work |
| status | `status:backlog` | `#8c959f` | Not ready to start |
| status | `status:ready` | `#bf8700` | Ready to start |
| status | `status:in-progress` | `#0969da` | Actively being worked |
| status | `status:blocked` | `#cf222e` | Cannot progress without resolution |
| priority | `priority:high` | `#cf222e` | Highest delivery priority |
| priority | `priority:medium` | `#bf8700` | Normal delivery priority |
| priority | `priority:low` | `#1a7f37` | Lower delivery priority |

GitHub's `closed` state means completed; do not add a competing done label. Assign a shared
milestone to each epic and story. Report milestone progress from GitHub and epic progress from its
open versus closed sub-issues.

Status and priority labels are mutually exclusive namespaces. Setting one **replaces** any existing
label in that same group: include the removals and addition in the proposal, remove the other labels
from the same group after confirmation, and preserve type labels and all unrelated labels.

## Safe operating procedure

1. Resolve the target repository, run `gh auth status`, then query the repository's
   `viewerPermission`. Stop without writing unless it is `WRITE`, `MAINTAIN`, or `ADMIN`.
2. For read-only requests, list milestones, issues, labels, parents, children, and calculated
   progress; never prepare an implicit write.
3. For a requested change, inspect existing labels, milestones, and issue node IDs first. Present
   every planned label, milestone, issue, edit, and parent-child link with its target repository.
4. Ask for **explicit confirmation** after the complete mutation list. Do not create, edit, label,
   close, or link anything before that confirmation.
5. After confirmation, perform only the approved operations and report every resulting URL or
   failure. Stop on an unexpected write failure rather than silently retrying or claiming success.

Create missing labels with `gh label create --color <table-color> --description <table-description>`
and milestones through `gh api`; reuse existing items by name. Create issues through the GitHub
GraphQL `createIssue` mutation, setting `milestoneId`,
`labelIds`, and `parentIssueId` when known. Link already-created issues with `addSubIssue`.
Use GraphQL node IDs rather than issue numbers for `parentIssueId` and `addSubIssue`.

## Commands to support

- Report the current milestone, epic, and story hierarchy and its progress.
- Propose or create a milestone, epic, or story with the supplied title, body, labels, and parent.
- Attach an existing story to an existing epic, using `addSubIssue` only after confirmation.
- Replace supplied status or priority labels without altering unrelated labels.

Never invent dates, assignees, estimates, or priorities. Ask for the missing value or omit it.
