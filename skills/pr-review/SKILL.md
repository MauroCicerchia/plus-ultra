---
name: pr-review
description: Use when reviewing a GitHub pull request against its approved plus-ultra technical contract and publishing or maintaining actionable review findings.
---

# plus-ultra PR review

Review one pull request rigorously, publish durable findings, and keep only still-valid findings
open. This is a writing workflow: it needs authenticated GitHub write access. Use
`plus-ultra:code-reviewer` instead when a read-only current-branch review is wanted.

## Invocation and preconditions

Accept only these forms:

```text
pr-review
pr-review <PR>
pr-review --spec <NNN|slug>
pr-review <PR> --spec <NNN|slug>
```

`<PR>` is one positive decimal integer. Parse arguments before any network write: reject an unknown
flag, a duplicate `--spec`, a missing selector value, a zero, negative, or non-integer PR number,
or any extra positional argument. Explain the valid forms and stop without a GitHub write.

1. Run `gh auth status`; stop before writes if authentication or GitHub write authorization is not
   available.
2. Resolve and validate the PR with `gh pr view <number>` (or `gh pr view` with no PR argument).
   Obtain closing Issues with `gh pr view <pr-number> --json closingIssuesReferences`; obtain the
   number, base ref, `baseRefOid`, `headRefName`, head repository, state, URL, and `headRefOid` in the same or a
   subsequent metadata request. Stop before writes if the PR cannot be found, is closed, or is not
   reviewable. Do not parse a closing keyword from the PR body. Do not use GraphQL to discover
   closing Issues.
3. At the remote PR head, list `specs/` and fetch every spec through the GitHub API with
   `headRefOid`. `headRefOid` is the source of truth for contract selection and review; do not read
   the local checkout as a substitute. Parse each file's path, `NNN-slug` stem, status, and optional
   positive `issue:` field. Retain all approved specs, including unlinked legacy specs, and exclude
   draft and superseded specs.
4. Resolve a contract using the deterministic chain below. Complete every read, selection prompt,
   and explicit acceptance before the first GitHub mutation.

## Resolve the review contract

Apply this precedence in order. A canonical resolution wins without consulting `--spec`; an
explicit selector is a fallback, never an override of a canonical resolution.

1. **Canonical closing-Issue match.** From `closingIssuesReferences`, collect approved remote-head
   specs whose `issue:` equals any closing Issue. If exactly one approved spec matches the closing
   Issues, select it without consulting `--spec`. If zero or several match, the canonical path has
   failed and continue.
2. **Explicit selector.** Only after canonical failure, resolve `--spec <NNN|slug>` against the
   remote-head specs. A number selects the one `NNN-…` path; a slug selects the one matching
   `NNN-slug` stem. A selector that is nonexistent, ambiguous, or resolves to any non-approved
   status—including missing, malformed, unknown, draft, or superseded—is fail-closed: explain why
   and stop without any GitHub write. A unique approved selection becomes the contract. If no
   selector was provided, continue.
3. **Branch association.** Match approved remote-head candidates against `headRefName` using both
   strict patterns, then union and deduplicate the direct and indirect results:
   - A linked spec matches directly when `issue-<N>` is a hyphen-delimited token in one branch-path
     component: `(?:^|-)issue-<N>(?:-|$)`. Do not treat `myissue-<N>`, `issue-<N>x`, or an Issue
     number without that token as a match.
   - Any approved spec matches indirectly only when its complete `NNN-slug` stem is an exact
     branch-path component separated by `/`: `(?:^|/)NNN-slug(?:/|$)`. Do not use prefix, substring,
     title, or fuzzy matching.
   One candidate continues as the contract. With multiple candidates, display the ordered candidate
   list described below and wait for the user's selection. With none, continue to discovery.
4. **Approved-spec discovery.** Consider every approved remote-head spec, including legacy specs
   without `issue:`. One candidate becomes the contract. Several candidates require the ordered
   selection list. No approved candidates enters the no-contract flow below.

For every ambiguous branch or discovery result, list candidates in ascending path order as
`specs/<path> — Issue #<N>` or `specs/<path> — sin Issue`. Wait for an explicit selection of one
listed approved path before writing to GitHub. If the selection is absent, invalid, ambiguous, or
not approved, stop without writes. Never infer a choice from the selector, branch, or local files
after displaying this list.

## No-contract flow

If no approved spec exists at the remote PR head, explain how to add one: create a draft with
`plus-ultra:spec new [<slug>] --issue <positive-integer>` when relevant, complete it, and move it to
`approved`. Offer a review without a contract and wait for explicit acceptance before writing.

With that acceptance, review correctness, regressions, tests, and the applicable
`plus-ultra:engineering-principles`; preserve the normal inline-comment, deduplication, and
canonical-summary process. Do not evaluate acceptance criteria or issue a `ready` verdict. The
summary must include `Spec: none` and the exact verdict `limited review; no contractual verdict`.
Resolve an earlier tagged finding only when fresh evidence proves it fixed without relying on a
contract; leave contract-dependent findings unresolved and explain that limitation.

## Gather review evidence

1. Fetch the submitted change at the same remote-head snapshot. Prefer the GitHub API comparison
   `repos/<owner>/<repo>/compare/<baseRefOid>...<headRefOid>` and file contents at `headRefOid`.
   `gh pr diff <pull_number>` is only a visual aid: after it returns, re-fetch PR metadata and use
   its output only when `headRefOid` is unchanged, proving it is the same remote-head snapshot.
   Re-fetch PR metadata immediately before the first mutation; if `headRefOid` changed, discard all
   gathered evidence and restart contract resolution and review. Do not substitute the reviewer's
   local branch for the PR head.
2. Fetch changed-file metadata and patches through the GitHub API as needed. Keep the PR
   `headRefOid`: it is the commit SHA required for valid inline comments.
3. Identify the authenticated reviewer (`gh api user`) and enumerate existing review threads with
   a GraphQL query. **Paginate** until all pages are read; retain thread ID, resolved state, comment
   author, body, path, line/side, and anchor where available.
4. With a contract, read its acceptance criteria, interface contracts, architecture boundaries,
   functional core, test plan, and risks. Review for unmet acceptance criteria, correctness and
   regression risks, contracts, error handling, tests, and the architecture/functional-core
   boundaries in `plus-ultra:engineering-principles`. Without a contract, use the limited scope
   above instead.

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
authenticated reviewer; leave other authors’ threads untouched and report that skip. In a limited
review, resolve only findings whose evidence does not depend on a contract. Resolve with the GraphQL
`resolveReviewThread` mutation and report the thread ID.

## Publish and update the summary

Build one canonical summary with this verdict-first Markdown contract. The stable summary marker
must appear once, first; do not substitute a new marker or put an emoji in the title. Copy the
shape below, replacing placeholders and omitting the explicitly optional or empty content. The
leading spaces on the template's lower-level headings are valid Markdown indentation and keep this
contract within this source-of-truth section.

<!-- plus-ultra:pr-review:summary -->
# Plus Ultra PR Review

 ## Status

Select exactly one visible verdict:

- `✅ Ready — no findings or non-blocking findings.` Use this when there are no findings, or when
  every current finding is non-blocking.
- `⛔ Changes required — one or more blockers.` Use this when one or more current findings block
  the contractual review.
- `⚠️ Limited review — Spec: none; limited review; no contractual verdict` Use this only for an
  accepted no-contract review. It must not say `ready`.

State the review scope and the basis for the selected verdict in plain language.

 ## Findings

When there are no current findings, write `No findings.` and say what was reviewed. Otherwise,
group visible findings only beneath the severity headings that are present; omit every empty
severity heading and do not add a separate unanchorable category. Each unanchorable finding remains
visible under its applicable severity and is marked `[summary-only]`, for example:

 ### <Severity>

- **[summary-only] <human finding>** — <failure scenario, affected behavior, and requested fix>.
  This finding is unanchorable and therefore summary-only.

 ## Traceability

| Issue | Spec | Contract |
| --- | --- | --- |
| #<N> | `specs/<path>` (approved) | Contractual review |
| none | `specs/<path>` (approved) | Contractual review |
| none | none | Limited review |

Use the second row for an approved legacy contract whose frontmatter has no `issue:` field. For a
limited review, use the third row with `none` in the Issue and Spec cells and `Limited review` in
Contract. This keeps a no-Issue contractual review distinct from a no-contract limited review.

 ## Resolutions from the previous review

Include this section only when one or more prior findings were resolved. Describe each resolution
human-first (the behavior that is now fixed and the evidence), not as an internal identifier. Keep
thread IDs in Metadata only.

 <details>
 <summary>Evidence</summary>

- Review scope, remote-head evidence, changed files, tests, and the evidence supporting each
  visible finding or resolution.

 </details>

 <details>
 <summary>Metadata</summary>

- IDs are metadata-only; include them only when non-empty.
- SHAs are metadata-only; include them only when non-empty.
- Duplicate thread references are metadata-only; include them only when non-empty.
- Counts are metadata-only; include them only when non-empty.

 </details>

Do not surface IDs, SHAs, duplicate thread references, or counts outside Metadata; omit each when
empty. This preserves a human-readable canonical comment while retaining exceptional bookkeeping
when it is useful.

List PR issue comments through `issues/comments` (paginate if needed) and locate summary marker
comments created by the authenticated reviewer. Update the most recently updated such summary marker
comment as the canonical comment; otherwise create it via `issues/comments`. Do not create a new
summary marker comment on every run. Leave untagged comments and other authors' marker comments
alone, reporting any existing duplicate marker comments as an ambiguity. Use `gh api` for these
calls and report the comment ID and whether it was created or updated.

## Final report

Report every mutation and every skip: inline comments created, duplicate inline comments skipped,
threads resolved or left unresolved (with reason), and the summary created or updated. Include PR
number and URL, spec path or `none`, reviewer identity, findings with `path:line`, and the final verdict. If
preconditions fail, report the failure and confirm that no GitHub write was attempted.
