---
name: issue-management
description: Use when creating, organizing, linking, or reporting GitHub milestones, epics, and stories with the gh CLI.
---

# GitHub issue management

Use GitHub Issues as the source of truth. A **Milestone** is a release or roadmap horizon; an
**Epic** is an issue labelled `type:epic`; a **Story** is an executable sub-issue labelled
`type:story`. Do not use GitHub Projects or an MCP for this workflow.

## Hierarchy capabilities

GitHub CLI v2.94.0 introduced native issue hierarchy operations. Detect each capability from the
relevant `gh issue ... --help` output; do not infer support by parsing the installed version.

- New sub-issue: `gh issue create --parent <parent>`.
- Existing issue link: `gh issue edit <parent> --add-sub-issue <child>`.
- Hierarchy report: `gh issue view <issue> --json parent,subIssues,subIssuesSummary`.

Use the native operation whenever its flag or JSON fields are present. If a required capability is
absent, use GraphQL only as the fallback for that hierarchy operation. This keeps v2.92.0-era
installations usable without making GraphQL the preferred path.

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
3. For a requested change, inspect existing labels and milestones first. Inspect issue node IDs only when a missing hierarchy capability requires the GraphQL fallback. Present every planned label,
   milestone, issue, edit, and parent-child link with its target repository.
4. Ask for **explicit confirmation** after the complete mutation list. Do not create, edit, label,
   close, or link anything before that confirmation.
5. After confirmation, perform only the approved operations and report every resulting URL or
   failure. Stop on an unexpected write failure rather than silently retrying or claiming success.

Create missing labels with `gh label create --color <table-color> --description <table-description>`
and milestones through `gh api`; reuse existing items by name. Create every issue with `gh issue
create`, passing its title, body, labels, and milestone. When `--parent` is available, pass the
parent issue number or URL during creation.

For an existing issue, link it with `gh issue edit <parent> --add-sub-issue <child>` when that flag
is available. For hierarchy reports, use the structured `parent`, `subIssues`, and
`subIssuesSummary` JSON fields when available; use the summary rather than scraping terminal text.

If `--parent` is absent, create the issue with `gh issue create` and then attach it with the native
`--add-sub-issue` flag when available. If the needed linking flag is absent, look up only the
parent and child node IDs and invoke the GraphQL `addSubIssue` mutation as a fallback. If the JSON
hierarchy fields are absent, issue a read-only GraphQL query for `parent`, `subIssues`, and
`subIssuesSummary` instead. Do not use GraphQL for ordinary issue creation, labels, milestones, or
reporting when the corresponding native capability exists.

## Commands to support

- Report the current milestone, epic, and story hierarchy and its progress.
- Propose or create a milestone, epic, or story with the supplied title, body, labels, and parent.
- Attach an existing story to an existing epic with `gh issue edit`; use GraphQL only when that
  native hierarchy capability is absent, and only after confirmation.
- Replace supplied status or priority labels without altering unrelated labels.

Never invent dates, assignees, estimates, or priorities. Ask for the missing value or omit it.
