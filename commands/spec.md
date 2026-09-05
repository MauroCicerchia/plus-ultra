---
description: Manage Issue-aware specs — list, create from an Issue, link an Issue, or update technical-contract status. Follows plus-ultra:spec-conventions.
argument-hint: "[list | new [<slug>] --issue <positive-integer> | link <NNN|slug> <positive-integer> | status <NNN|slug> <draft|approved|superseded>]"
---

Manage the repo's specs under `specs/`, following the `plus-ultra:spec-conventions` skill. GitHub
Issues own work progress; specs track only their technical-contract lifecycle.

Arguments: `$ARGUMENTS`

Interpret the arguments using this complete grammar:

```
list
new --issue <positive-integer>
new <kebab-case-slug> --issue <positive-integer>
link <NNN|slug> <positive-integer>
status <NNN|slug> <draft|approved|superseded>
```

Reject invalid Issue numbers before issuing commands. Before every create or link mutation, run
`gh issue view <number>`; do not query or require `type:story`.

## `list` (or no arguments)

Scan `specs/*.md`, read each file's `status:` frontmatter, and print a grouped summary in this
order: Approved → Drafts → Superseded. Append `Issue #<number>` when an `issue:` field is present.

## `new [<slug>] --issue <positive-integer>`

Validate the Issue number and run `gh issue view <number>`. Find the next unused zero-padded
three-digit `NNN`; never reuse a number.

With no slug, derive the title and a non-empty kebab-case slug from the Issue title. If derivation
is empty or the target exists, stop and request an explicit slug. With a caller-provided slug, use
it but still derive the title from the Issue; if the target exists, stop and request another explicit
slug. Copy the template into `specs/NNN-<slug>.md`, set `status: draft`, `issue: <number>`, and the
current date, then leave the section prompts for the user to complete and report the path.

## `link <NNN|slug> <positive-integer>`

Resolve exactly one spec. Validate and view the Issue before editing. Add an absent `issue:` field;
if it is identical, report no change. For a different Issue, display old and new values and require
explicit confirmation before replacing it.

## `status <NNN|slug> <draft|approved|superseded>`

Resolve exactly one spec. Warn, but do not hard-block, on skipped or reversed transitions. Never
enforce an active-spec singleton. Edit only `status:` and report the change.

If the arguments do not match this grammar, explain the supported forms and stop.
