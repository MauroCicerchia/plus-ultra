---
name: pr-review
description: Use when reviewing a GitHub pull request against its approved plus-ultra technical contract and publishing or maintaining actionable review findings.
---

# plus-ultra PR review

Review one pull request rigorously, publish durable findings, and keep only still-valid findings
open. This is a writing workflow: it needs authenticated GitHub write access. Use
`plus-ultra:code-reviewer` instead when a read-only current-branch review is wanted.

## Preconditions and target

1. Accept no argument or one **positive PR number**. With no argument, use the PR for the current
   branch. Reject zero, negative, non-integer, or extra arguments before any write.
2. Run `gh auth status`; stop before writes if authentication or GitHub write authorization is not
   available.
3. Resolve and validate the PR with `gh pr view <number>` (or `gh pr view` for no argument). First
   obtain closing Issues with `gh pr view <pr-number> --json closingIssuesReferences`; fetch its
   number, base ref, head ref, head repository, state, URL, and `headRefOid` in the same or a
   subsequent PR-metadata request. Stop before writes if the PR cannot be found, is closed, or is
   not reviewable. Do not parse a closing keyword from the PR body. Do not use GraphQL to discover
   closing Issues.
4. From the **remote PR head**, list `specs/` and fetch each candidate spec through the GitHub API
   at `headRefOid`; do not read the local checkout as the source of truth. For every closing Issue,
   collect only approved specs (`status: approved`) whose `issue:` matches that Issue; exclude draft
   and superseded specs. Select a contract only when exactly one approved spec matches the closing
   Issues. Do not substitute an unlinked or merely sole approved spec when that canonical match is
   missing. If zero or several candidates match, report every approved candidate and delegate the
   missing or ambiguous resolution fallback to #17; stop before any GitHub writes. Read the selected
   approved spec's acceptance criteria, interface contracts, architecture boundaries, functional core,
   test plan, and risks.

Do all validation and collection before the first mutation. State every stop or skip and why.

## Gather review evidence

1. Fetch the submitted change with `gh pr diff <pull_number>` and inspect changed files in context.
   Use the PR base/head range when local context is useful; do not substitute the reviewer’s local
   branch for the PR head.
2. Fetch changed-file metadata and patches through the GitHub API as needed. Keep the PR
   `headRefOid`: it is the commit SHA required for valid inline comments.
3. Identify the authenticated reviewer (`gh api user`) and enumerate existing review threads with
   a GraphQL query. **Paginate** until all pages are read; retain thread ID, resolved state, comment
   author, body, path, line/side, and anchor where available.
4. Read enough surrounding source, tests, and spec text to substantiate each finding. Review for
   unmet acceptance criteria, correctness and regression risks, contracts, error handling, tests,
   and the architecture/functional-core boundaries in `plus-ultra:engineering-principles`.

Only report a defect with a concrete failure scenario and a precise `path:line` when one exists.
Do not manufacture nits, repeat a finding already addressed by the PR, or treat style preference as
a defect.

## Findings and markers

Use these exact, stable markers at the beginning of the corresponding Markdown comments:

- Inline: `<!-- plus-ultra:pr-review:inline -->`
- Summary: `<!-- plus-ultra:pr-review:summary -->`

An inline finding should state severity, the failure scenario, why the selected line causes it, and
a practical correction. It must be anchored to an added/right-side line in the current PR diff. If
it cannot be anchored validly, it is **unanchorable** and belongs in the summary instead.

For inline comments, use the REST endpoint `pulls/{pull_number}/comments` with:

- `commit_id` set to the current PR `headRefOid`;
- the changed-file `path`;
- `line` pointing to a valid added line; and
- `side: "RIGHT"`.

Never use a stale SHA, a LEFT-side line, or an approximate line number. If an attempted anchor is
invalid, do not retry by guessing; record the finding in the summary and report the skipped inline
mutation.

## Maintain prior review state

Before creating a comment, compare its normalized finding (path, affected behavior, and requested
fix) with every **equivalent unresolved** tagged thread. Deduplicate equivalent unresolved findings:
skip a duplicate and report the existing thread instead of creating another one.

For a previously tagged unresolved thread, re-check the current PR head. Resolve it only when a
fresh review proves the reported problem is fixed. Never resolve a thread merely because code near
it changed. In addition, only resolve a tagged thread when its review comment was authored by the
authenticated reviewer; leave other authors’ threads untouched and report that skip. Resolve with
the GraphQL `resolveReviewThread` mutation and report the thread ID.

## Publish and update the summary

Build one canonical summary containing the summary marker, review scope, spec status, findings by
severity, unanchorable findings, skipped duplicates, resolutions, and a clear verdict. A no-finding
summary should say what was reviewed and that no substantiated blocking issues were found.

List PR issue comments through `issues/comments` (paginate if needed) and locate summary marker
comments created by the authenticated reviewer. Update the most recently updated such summary marker
comment as the canonical comment; otherwise create it via `issues/comments`. Do not create a new
summary marker comment on every run. Leave untagged comments and other authors' marker comments
alone, reporting any existing duplicate marker comments as an ambiguity. Use `gh api` for these
calls and report the comment ID and whether it was created or updated.

## Final report

Report every mutation and every skip: inline comments created, duplicate inline comments skipped,
threads resolved or left unresolved (with reason), and the summary created or updated. Include PR
number and URL, spec path, reviewer identity, findings with `path:line`, and the final verdict. If
preconditions fail, report the failure and confirm that no GitHub write was attempted.
