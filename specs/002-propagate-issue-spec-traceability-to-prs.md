---
title: Propagate Issue–Spec traceability into pull requests
status: approved # draft → approved → superseded
issue: 31
created: 2026-09-05
---

# 002 — Propagate Issue–Spec traceability into pull requests

## Problem

PR creation and review need a deterministic link from a GitHub Issue to its approved technical
contract without copying product-work state into specs. A partial PR must not accidentally close a
story merely because it references that story or its spec.

## Goals / Non-goals

**Goals**

- Preserve linked Issue and approved spec path in PR descriptions.
- Use `Refs #<number>` for safe, incremental PR traceability and `Closes #<number>` only when the
  resulting branch fully completes an executable story contract.
- Resolve a review contract from PR closing Issues and remote-head approved specs before any fallback.
- Keep GitHub Issues authoritative for product-work status and specs authoritative for technical
  contracts.

**Non-goals**

- Add a PR-creation command, a CI validator, a hook, or a second product-state store.
- Close Issues automatically or infer a closing keyword from branch names, commits, or PR prose.
- Implement missing or ambiguous PR-to-spec fallback behavior; issue #17 owns that work.

## Acceptance criteria

- [x] PR-description guidance includes `Issue: #N`, approved `Spec: specs/...`, and exactly one of
      `Refs #N` or `Closes #N` per independently resolved Issue when traceability is available.
- [x] `Closes #N` requires a `type:story` Issue, an approved linked spec, complete scope and
      acceptance criteria at the resulting branch state, a `ready` final review with no contract
      blockers, and no required deferred work.
- [x] Incremental PRs may use `Refs #N`; the closing decision evaluates branch state against the
      base, not only the individual diff, and ambiguity never produces `Closes #N`.
- [x] PR review obtains closing Issues with `gh pr view <pr-number> --json closingIssuesReferences`,
      reads candidate specs at the remote PR head, and selects only one approved Issue-matched spec.
- [x] Deterministic review resolution never parses closing-keyword text or uses GraphQL to discover
      closing Issues; it excludes draft and superseded specs and delegates missing or ambiguous
      resolution to #17 before writes.
- [x] README and regression tests describe and enforce the portable workflow.

## Interface contracts

PR bodies use this traceability shape when an approved linked spec is available:

```markdown
## Traceability
- Issue: #42
- Spec: `specs/002-example.md` (approved)
- Refs #42
```

Replace the final line with `Closes #42` only after every closing condition is demonstrable. For
multiple stories, include a separate group and decide each relationship independently.

The review workflow's canonical discovery command is:

```sh
gh pr view <pr-number> --json closingIssuesReferences
```

It selects a contract only if all Issue-matched, remote-head approved candidates total exactly one.

## Architecture boundaries

`skills/pull-request-descriptions/SKILL.md` owns author-facing traceability and closing guidance.
`skills/pr-review/SKILL.md` owns remote review-contract selection; the Claude-only reviewer agent
mirrors that portable skill. GitHub API and `gh` access remain workflow steps, while no hook or
local spec parser performs network activity.

## Functional core

The workflow's decision is deterministic from Issue labels, approved linked spec frontmatter, the
base-to-head resulting state, final review verdict, and explicitly deferred work. Its conservative
default is `Refs`: unavailable evidence maps to a non-closing relationship rather than a guessed
state transition.

## Data model

```yaml
issue: 31 # optional numeric GitHub Issue link in approved spec frontmatter
```

```markdown
Issue: #<number>
Spec: `specs/<path>` (approved)
Refs #<number> | Closes #<number>
```

The PR body stores only a GitHub reference and spec path; it does not mirror Issue status.

## Test plan

- Assert the description template and guidance require the traceability shape, conservative default,
  story label, complete-contract evidence, final `ready` review, and independent multi-Issue choice.
- Assert the review skill and Claude agent use `closingIssuesReferences`, remote `headRefOid`, unique
  approved linked candidates, no closing-keyword parsing, no GraphQL Issue discovery, and #17 handoff.
- Run the repository Node test suite, diff check, plugin validation, and clean Codex packaging install.

## Risks

- A reviewer can overstate contract completeness; requiring explicit evidence and defaulting to
  `Refs` avoids premature Issue closure.
- A PR can reference multiple stories but yield multiple approved contracts; deterministic review
  intentionally stops and leaves that resolution to #17.
- GitHub's closing syntax is meaningful only on merge, so PR authors must refresh the relationship
  after the final review rather than declaring closure at the start of an incremental PR.
