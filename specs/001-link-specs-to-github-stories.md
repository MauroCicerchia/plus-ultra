---
title: Link specs to GitHub stories
status: approved # draft → approved → superseded
issue: 30
created: 2026-09-05
---

# 001 — Link specs to GitHub stories

## Problem

GitHub Issues are the source of truth for product work, while `specs/` holds
the durable technical contract. The current spec lifecycle duplicates work
progress with `in-progress` and `done` states, and has no direct way to relate
a spec to the GitHub story that requested it.

## Goals / Non-goals

**Goals**

- Add an optional positive-integer `issue` field to spec frontmatter.
- Make the spec lifecycle `draft → approved → superseded`; the Issue remains
  authoritative for work progress and completion.
- Extend `plus-ultra:spec` with creation and linking workflows for an existing
  GitHub Issue.
- Show approved specs and their local Issue references on session resume.
- Preserve unlinked and legacy specs as valid repository-local candidates.

**Non-goals**

- Reading, storing, or synchronizing an Issue body, labels, or product-work
  status in a spec.
- Requiring a linked Issue to carry the `type:story` label.
- Creating, editing, closing, or otherwise changing GitHub Issues from spec
  lifecycle transitions.
- Having `refine-issues` create or link specs automatically.

## Acceptance criteria

- [x] Spec frontmatter accepts an optional `issue: <positive integer>` field;
      specs without it remain supported.
- [x] Template, portable skills, Claude command/agent guidance, manifests,
      README, hooks, and tests use `draft`, `approved`, and `superseded` only
      for spec status.
- [x] `plus-ultra:spec new --issue <number>` verifies the Issue exists with
      `gh issue view`, derives its title and a kebab-case slug, and creates the
      next-numbered draft spec with its `issue` field.
- [x] `plus-ultra:spec new <slug> --issue <number>` verifies the Issue and
      uses the explicit slug while deriving the spec title from the Issue.
- [x] `plus-ultra:spec link <NNN|slug> <number>` verifies the Issue, writes
      the `issue` field for an unlinked spec, and is idempotent when it already
      points to that number.
- [x] Linking a different Issue never silently replaces an existing `issue`:
      the workflow displays the old and new values and requires explicit
      confirmation before updating frontmatter.
- [x] `refine-issues` may recommend `plus-ultra:spec new --issue <number>` as
      a next step, but makes no spec file changes itself.
- [x] Session resume lists approved specs, appending `Issue #<number>` when
      the frontmatter contains one, and does not identify a globally active
      spec.
- [x] Superseded specs remain readable history and are excluded from new-work
      and review selection; approved specs are the current technical contract.

## Interface contracts

`plus-ultra:spec` supports these requests in addition to `list` and status
updates:

```text
new --issue <positive-integer>
new <kebab-case-slug> --issue <positive-integer>
link <NNN|slug> <positive-integer>
status <NNN|slug> <draft|approved|superseded>
```

For both `new` forms and `link`, the workflow performs a read-only
`gh issue view <number>` existence check before modifying a local spec. It
does not require or inspect a `type:story` label. A successful `new` writes:

```yaml
title: <GitHub Issue title>
status: draft
issue: <number>
created: <YYYY-MM-DD>
```

The SessionStart hook emits local context in this shape, without a network
request:

```text
plus-ultra spec status:
  - Approved (current technical contracts): 001-example.md (Issue #30)
```

## Architecture boundaries

This is a portable Markdown-plugin workflow. `skills/spec/SKILL.md` owns the
user-facing lifecycle and GitHub read instructions; `skills/spec-conventions/`
owns the frontmatter and lifecycle rules. Claude-only command and agent files
mirror the portable skill without becoming the source of truth. The dependency-
free `hooks/session-start.mjs` reads only local spec frontmatter and must fail
open if files are absent or malformed.

## Functional core

The hook's frontmatter parsing and approved-spec formatting stay deterministic
and side-effect free apart from reading files and writing its normal hook
output. GitHub access is a read-only, user-invoked workflow step described in
the skill rather than a hook responsibility. Replacing an existing link is an
explicit confirmation boundary, not an inferred mutation.

## Data model

```yaml
---
title: Link specs to GitHub stories
status: draft # draft | approved | superseded
issue: 30 # optional positive integer; GitHub Issue number
created: 2026-09-05
---
```

`issue` is intentionally only the numeric reference. The Issue remains the
canonical location for product state and product requirements.

## Test plan

- Extend skill-content tests to assert the three-state lifecycle, each new
  `spec` invocation, Issue existence checking, explicit replacement
  confirmation, and the non-`type:story` compatibility rule.
- Update hook fixtures from `in-progress` to approved/unlinked and approved/
  linked specs; assert the SessionStart context includes `Issue #<number>` and
  does not emit an active-spec designation.
- Preserve a fixture for malformed, missing, and unlinked frontmatter so the
  hook remains fail-open.
- Run the repository Node test suite and plugin validation commands for the
  marketplace and plugin manifests.

## Risks

- Deriving a slug from an Issue title can produce an empty or duplicate slug;
  the workflow must require a usable slug or prompt for the explicit-slug form
  rather than overwrite a file.
- A stale, deleted, or unauthorized Issue must stop the create/link flow before
  any local spec mutation.
- Mechanical lifecycle wording can be missed in a Claude-only surface or a
  manifest; repository-wide tests and search cover every distribution surface.
- The session hook must not call `gh`, because startup context must remain
  dependency-free and fail open.
