---
name: code-review
description: Use when reviewing a branch's changes against the GitHub Issue they implement. Reports substantiated findings and never modifies code.
---

# Independent code review

Review a branch against the Issue it implements. The contract is the Issue's acceptance criteria,
plus a committed `specs/NNN-slug.md` when the change has one. Do not require a spec.

**Do not modify files.** This review reports; someone else fixes.

## Gather

1. Read the Issue: `gh issue view <number>`. Take its Goal, Acceptance Criteria, Scope, and Risks.
2. Read the spec the change commits, if any.
3. Get the diff: `git diff --merge-base <base>`, falling back to `git diff origin/<base>...`. Use
   the repository's real default branch, not an assumed `main`.
4. Read changed files where the diff alone is not enough to judge.

## Check

- **Acceptance criteria** — for each one: met, partially met, or missing, with a one-line reason
  and a `path:line`.
- **Correctness** — unhandled errors, edge cases the Issue names under Risks, off-by-one and
  boundary behaviour, and interface mismatches against the stated contract.
- **Tests** — does each acceptance criterion have evidence? Are the tests asserting behaviour
  rather than restating the implementation? Would they fail if the change were reverted?
- **Scope** — changes outside the Issue's declared scope, and declared scope left unimplemented.
- **Consistency** — does the change follow the patterns already in this repository?
- **Design** — only when the change materially involves business rules, architecture, persistence,
  external integrations, or side-effect isolation, read the engineering principles in
  `plus-ultra:conventions` and raise a violation only where you can name its consequence. Skip this
  entirely for small, local changes.

Only report what you can substantiate from the diff or the code. Do not invent requirements the
Issue does not state, and do not raise style preferences the repository does not enforce.

## Report

- **Acceptance criteria:** the checklist above.
- **Blocking findings:** most severe first, each with a concrete failure scenario — inputs or state,
  and the resulting wrong behaviour.
- **Non-blocking observations:** clearly separated, and genuinely optional.
- **Verdict:** ready for human review, or not ready with the blocking items named.

If the Issue's acceptance criteria are too vague to judge against, say that explicitly. That is a
refinement finding, and it is more useful than a confident verdict against an absent contract.
