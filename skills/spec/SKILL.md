---
name: spec
description: "Manage the plus-ultra spec lifecycle under specs/: list specs by status, create the next numbered spec from the template, or update a spec's status. Use when the user asks for the plus-ultra spec command, wants a new spec, wants to list specs, or wants to move a spec through draft, approved, in-progress, and done."
---

# plus-ultra spec lifecycle

Use this skill as the portable equivalent of Claude Code's `/plus-ultra:spec` command.

Follow `plus-ultra:spec-conventions` for numbering and lifecycle rules.

## Supported requests

### List specs

For `list`, or when no specific action is given:

1. Scan `specs/*.md`.
2. Read each file's `status:` frontmatter.
3. Print a grouped summary in this order:
   `In progress`, `Approved`, `Drafts`, `Done`.
4. Note if more than one spec is `in-progress`; normally only one should be.

### Create a new spec

For `new <slug>`:

1. Find the highest existing `NNN` prefix in `specs/` and add one. Use zero-padded three-digit numbers. Never reuse numbers.
2. Copy `skills/spec-conventions/template.md` into `specs/NNN-<slug>.md`.
3. Set `status: draft`.
4. Fill in the title from the slug.
5. Leave the section prompts for the user to complete.
6. Report the created path.

### Update status

For `status <NNN|slug> <draft|approved|in-progress|done>`:

1. Resolve the spec file by number or slug.
2. Validate the transition against `draft -> approved -> in-progress -> done`.
3. Warn, but do not hard-block, on a skip or reversal; the user may have a reason.
4. If moving a spec to `in-progress` while another spec is already `in-progress`, call that out and confirm before editing.
5. Edit only the `status:` field in the frontmatter.
6. Report the change.

If the user's request does not match one of these forms, explain the three supported forms and stop.
