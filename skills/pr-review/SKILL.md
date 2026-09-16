---
name: pr-review
description: Use when reviewing a GitHub pull request against its approved plus-ultra technical contract and publishing or maintaining actionable review findings.
---

# plus-ultra PR review

Review one pull request rigorously against its remote-head contract. This workflow writes GitHub
review state; use `plus-ultra:code-reviewer` for a read-only current-branch review instead.

## Non-negotiable invariants

- Accept only `pr-review`, an optional positive PR number, and one optional `--spec <NNN|slug>`;
  reject malformed arguments before any network write.
- Confirm `gh` authentication and GitHub write authorization, then resolve an open, reviewable PR.
  Stop before writes on failed preconditions.
- Use the remote `headRefOid` for specs, changed files, findings, and every published mutation;
  never substitute the local checkout or parse closing keywords from the PR body.
- Resolve the approved contract deterministically: unique closing-Issue match, then explicit
  selector, then exact branch association, then explicit human selection. Ambiguity is fail-closed.
- Review without a contract only after explicit acceptance, as a limited review with no contractual
  verdict. Never mark a PR ready from a limited review.
- Preserve valid prior findings, resolve only findings disproved at the current remote head, and
  make every GitHub mutation attributable to the authenticated reviewer.

## Load the operational reference

Before reading GitHub evidence, selecting a contract, publishing findings, maintaining review
threads, or composing the final summary, read
[`references/review-operations.md`](./references/review-operations.md). It contains the command and
API recipes, exact resolver patterns, marker formats, summary template, and exceptional paths.

## Final report

Report the PR URL, remote head, selected spec or `none`, reviewer identity, created or skipped
findings, thread outcomes, summary outcome, and every precondition failure that prevented writes.
