# Independent code review

Review one immutable branch head against the Issue it implements. The contract is the Issue's
acceptance criteria, plus a committed `specs/NNN-slug.md` when the change has one. Do not require a
spec.

**Do not modify files.** This review reports; someone else fixes.

## Pin the evidence

Before pinning, require the implementation state to be verified and committed and the relevant
working tree to be clean. Run `git status --short`; it must produce no output. If tracked changes
differ from `HEAD`, do not review. Return control to the implementer to verify and commit them first.
Relevant untracked files also belong in the committed state before review.

Then resolve the repository's real default branch and record the exact head SHA with
`git rev-parse HEAD`. Review only the diff ending at that SHA: use `git diff <base>...<head-sha>`,
where `<base>` is the merge base or remote default branch. Include the exact head SHA in the
verdict. Before reporting, check both the SHA and `git status --short` again. If the head moves or
the working tree becomes dirty during review, discard the verdict and restart only after the state
is clean and committed.

## Gather

1. Read the Issue with `gh issue view <number>`; extract its Goal, Acceptance Criteria, Scope, and
   Risks.
2. Read the spec the reviewed head commits, if any.
3. Read the pinned diff and changed files where the diff alone is insufficient.

## Check

- **Acceptance criteria:** mark each met, partially met, or missing, with a one-line reason and a
  `path:line`.
- **Correctness:** check named risks, errors, edge cases, boundaries, and contract mismatches.
- **Tests:** require evidence for each criterion, behavioural assertions, and tests that would fail
  if the change were reverted.
- **Scope and consistency:** find unimplemented declared scope, out-of-scope changes, and divergence
  from repository patterns.
- **Design:** only when the change materially involves business rules, architecture, persistence,
  external integrations, or side-effect isolation, read the engineering principles in
  `plus-ultra:conventions` and report a violation only with a concrete consequence. Skip this for
  ordinary small and local work.

Only report what you can substantiate from the pinned diff or code. Do not invent requirements or
report unenforced style preferences.

## Report

- Acceptance-criteria checklist.
- Blocking findings, most severe first, each with an input or state and the resulting wrong
  behaviour.
- Clearly separated, genuinely optional non-blocking observations.
- Exact head SHA and a verdict: ready for human review, or not ready with blockers named.

If acceptance criteria are too vague to judge, report that refinement finding instead of inventing
a contract. After blocker fixes, repeat verification, commit, and the clean-worktree gate before
the final review pass over the resulting exact head SHA. The earlier verdict does not cover it.
