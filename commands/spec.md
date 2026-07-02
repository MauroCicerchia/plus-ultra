---
description: Manage spec-driven lifecycle — list specs, create the next-numbered spec, or flip a spec's status. Follows plus-ultra:spec-conventions.
argument-hint: "[new <slug> | status <NNN|slug> <draft|approved|in-progress|done> | list]"
---

Manage the repo's specs under `specs/`, following the `plus-ultra:spec-conventions` skill. Read that
skill if you need the numbering/lifecycle rules.

Arguments: `$ARGUMENTS`

Interpret the arguments and act:

## `list` (or no arguments)
Scan `specs/*.md`, read each file's `status:` frontmatter, and print a grouped summary:
In progress → Approved → Drafts → Done. Note if more than one spec is `in-progress` (normally only
one should be).

## `new <slug>`
1. Find the highest existing `NNN` in `specs/` and add one (zero-padded 3 digits). Never reuse.
2. Copy the template from the `plus-ultra:spec-conventions` skill (`template.md`) into
   `specs/NNN-<slug>.md` with `status: draft`.
3. Fill in the title; leave the sections as prompts for the user to complete. Report the path.

## `status <NNN|slug> <new-status>`
1. Resolve the spec file by number or slug.
2. Validate the transition follows `draft → approved → in-progress → done` (warn, don't hard-block,
   on a skip or reversal — the user may have a reason).
3. If moving a spec to `in-progress` while another is already `in-progress`, call it out and confirm.
4. Edit only the `status:` field in the frontmatter. Report the change.

If the arguments don't match any of these, explain the three forms and stop.
