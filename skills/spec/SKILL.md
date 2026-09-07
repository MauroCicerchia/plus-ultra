---
name: spec
description: "Manage the plus-ultra spec lifecycle under specs/: list specs by status, create or link Issue-aware specs, or update a spec's status. Use when the user asks for the plus-ultra spec command, wants a new spec, wants to link a GitHub Issue, wants to list specs, or wants to move a spec through draft, approved, and superseded."
---

# plus-ultra spec lifecycle

Use this skill as the portable equivalent of Claude Code's `/plus-ultra:spec` command.

Follow `plus-ultra:spec-conventions` for numbering and lifecycle rules. GitHub Issues own work
progress; a spec records only its technical-contract lifecycle.

## Durable product context

When creating a new technical contract, read a present `docs/product.md` as product context before
shaping the contract. A repository without a brief remains compatible: continue normally and never
create, edit, write, or mutate `docs/product.md` implicitly. The administrative `list`, `link`, and
`status` operations continue without a missing brief and do not block on product discovery.

If a new contract creates a durable contradiction with a present brief, pause the current workflow,
invoke `$product-discovery` for a focused rediscovery update; only after its explicit human
approval, resume the current workflow. This workflow consumes the brief read-only; it never resolves or writes the strategic
change.

## Supported requests

Use this complete grammar:

```
list
new --issue <positive-integer>
new <kebab-case-slug> --issue <positive-integer>
link <NNN|slug> <positive-integer>
status <NNN|slug> <draft|approved|superseded>
```

Reject an Issue number that is not a positive integer before issuing commands. Before every create
or link mutation, run `gh issue view <number>` to confirm the Issue exists. The `type:story` label is not required or queried: any GitHub Issue may be linked.

### List specs

For `list`, or when no specific action is given:

1. Scan `specs/*.md` and read each file's `status:` frontmatter.
2. Print a grouped summary in this order: `Approved`, `Drafts`, `Superseded`.
3. Append `Issue #<number>` for every spec with an `issue:` field.

### Create a new spec from an Issue

For `new --issue <positive-integer>`:

1. Validate the Issue number, then run `gh issue view <number>`.
2. Derive a title and non-empty kebab-case slug from the Issue title.
3. If the derived slug is empty or its target path exists, stop and request an explicit slug.
4. Find the next unused `NNN` prefix and create `specs/NNN-<slug>.md` from the template.
5. Write the Issue-derived title, `status: draft`, `issue: <number>`, and the current date. Leave
   the section prompts for the user to complete.

For `new <kebab-case-slug> --issue <positive-integer>`, validate and view the Issue in the same
way, use the caller's slug, derive the title from the Issue, and write `status: draft`,
`issue: <number>`, and the current date. Create the next unused file; if its target exists, stop
and request another explicit slug.

### Link an Issue

For `link <NNN|slug> <positive-integer>`:

1. Resolve exactly one spec file; stop if the selector matches none or more than one file.
2. Validate the Issue number and run `gh issue view <number>` before editing.
3. Add an absent `issue:` field. If it already has the identical number, report that there is no
   change.
4. If it has a different Issue number, display the old and new values and require explicit confirmation before replacing it.

### Update status

For `status <NNN|slug> <draft|approved|superseded>`:

1. Resolve exactly one spec file by number or slug.
2. Warn, but do not hard-block, on a skipped or reversed transition.
3. Never enforce an active-spec singleton.
4. Edit only the `status:` field in the frontmatter and report the change.

If the request does not match this grammar, explain the supported forms and stop.
