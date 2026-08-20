---
name: pull-request-descriptions
description: "Use when drafting, revising, or reviewing pull request descriptions, GitHub PR bodies, merge request summaries, release-oriented change notes, or PR templates before opening or updating a PR."
---

# Pull Request Descriptions

## Overview

Write PR descriptions as a reviewer handoff, not a changelog. Lead with a concise, human-first
overview, then explain why the change exists, what behavior changed, how it was verified, and
where reviewers should focus.

## Workflow

1. Gather source material before writing:
   - `git diff origin/main...` or the target branch named by the user
   - related spec, issue, design doc, or acceptance criteria when present
   - test, lint, typecheck, build, or manual verification output from this branch
2. Separate facts from inference. If the diff does not prove something, phrase it as an assumption
   or omit it.
3. Write for the reviewer who has not followed the implementation.
4. Keep the body concise, but do not hide risk, missing verification, or follow-up work.

## Recommended Template

Use this shape unless the repository has its own required PR template:

```markdown
## At a glance
[At most three sentences: the problem, observable outcome, and affected audience.]

## Diagram
[Include this entire section only when the diagram rules below require it.]

## Context
[Why this change is needed. Link or name the spec/issue when applicable.]

## Summary
- [User-visible or maintainer-visible change]
- [Important implementation boundary or behavior change]

## Testing
- [Command or manual check run, with result]

## Risks
- [Risk, migration concern, rollout note, or "None known" if genuinely low risk]

## Review Guidance
- [Files, flows, edge cases, or decisions reviewers should inspect first]
```

## Section Guidance

**At a glance:** In at most three sentences, state the problem, the observable outcome, and the
affected audience. Keep implementation and file-level details in later sections.

**Diagram:** Include exactly one compact Mermaid diagram only when the change crosses three or more
components, services, or modules; changes request, data, control, or dependency flow across
boundaries; changes lifecycle or state transitions; or has a non-obvious before/after architecture.
Use `flowchart` for topology or data flow, `sequenceDiagram` for ordered interactions, and
`stateDiagram-v2` for lifecycle changes. Use human-readable labels and no more than eight nodes or
participants. Omit the entire Diagram section for localized fixes, straightforward
documentation/configuration/dependency updates, or visuals that only repeat the overview. Never
invent relationships or leave placeholder Mermaid. All prose and diagram edges must be supported
by the diff, issue/spec, or verified behavior.

## Diagram Examples

- **Localized fix:** A one-module validation correction — omit the Diagram section.
- **Cross-component flow:** An upload request moving through the web app, API, and storage service —
  use a `flowchart`.
- **Ordered interaction:** A client request, authorization check, and asynchronous worker handoff —
  use a `sequenceDiagram`.
- **Lifecycle change:** A job moving from queued to running, retrying, and complete — use a
  `stateDiagram-v2`.

**Context:** Explain the problem and intent in one short paragraph. Avoid repeating the branch name
or commit subject. If this PR implements a spec, mention the spec path and status.

**Summary:** Prefer bullets that describe externally meaningful behavior or durable code boundaries.
Avoid file-by-file narration unless the file organization is the point of the PR.

**Testing:** List only verification that actually ran. Include commands exactly enough to be
reproducible, for example `pnpm test` or `node --test tests/hooks.test.mjs`. Say "Not run" with a
reason instead of implying coverage that does not exist.

**Risks:** Name compatibility, migration, security, data, performance, concurrency, release, and UX
risks. If there are no notable risks, use `None known` rather than deleting the section.

**Review Guidance:** Point reviewers at the highest-leverage questions: tricky logic, public
interfaces, untested paths, copied patterns, generated files, or intentional non-goals.

## Quality Bar

- Lead with the user's or maintainer's reason for caring.
- Tie claims to diff evidence, issue text, specs, or verification output.
- Mention behavior changes before implementation details.
- Keep status honest: incomplete verification, skipped tests, and known risks belong in the body.
- Remove process noise such as "this PR simply" or "just updates".

## Common Mistakes

- **Only summarizing commits:** Rewrite around user-facing outcome, architecture boundary, and review
  intent.
- **Diagram by default:** Omit the Diagram section unless the change meets a stated trigger and the
  visual adds information beyond the overview.
- **Unproven visual:** Do not invent diagram edges, components, or transitions that are not supported
  by the source material.
- **Overstating validation:** Replace vague claims with exact commands or `Not run`.
- **Burying risk:** Keep risks visible even when they are acceptable.
- **Repeating the diff:** Do not list every changed file. Explain why the set of changes hangs
  together.
- **Ignoring the repo template:** If `.github/pull_request_template.md` or a platform-provided
  template exists, preserve its required headings and improve the content inside them.

## Before Opening or Updating

Re-read the final body once as the reviewer. Check that the title and description agree, every test
claim is true, known limitations are visible, and the requested review focus is specific enough to
act on.
