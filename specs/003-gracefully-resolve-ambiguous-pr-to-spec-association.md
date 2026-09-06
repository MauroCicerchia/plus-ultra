---
title: Gracefully resolve ambiguous PR-to-spec association
status: approved
issue: 17
created: 2026-09-06
---

# 003 — Gracefully resolve ambiguous PR-to-spec association

## Problem

An approved spec cannot always be selected from a PR's closing Issues. Stopping there leaves useful
reviews unpublished, while guessing from local files or loose branch text can apply the wrong
contract.

## Goals / Non-goals

**Goals**

- Resolve a remote-head review contract through canonical, explicit, branch, and discovery fallbacks.
- Pause safely for human selection when more than one approved candidate remains.
- Permit an explicitly accepted, clearly limited review when no approved contract exists.

**Non-goals**

- Read `Issue.linkedBranches`, infer a relationship from titles, or use fuzzy branch matching.
- Change hooks, plugin manifests, OpenAI metadata, or `plus-ultra:code-reviewer`.
- Change Issue #17 or epic #20 titles, bodies, labels, hierarchy, or milestones.

## Acceptance criteria

- [x] Only the four planned invocation forms are accepted.
- [x] The selection order is unique `closingIssuesReferences` match, explicit selector only after
      canonical failure, strict `headRefName` association, then approved-spec discovery.
- [x] Every candidate is read at the remote `headRefOid`; draft and superseded specs are excluded,
      while approved legacy specs without `issue:` remain fallback candidates.
- [x] Review evidence is pinned to the same remote-head snapshot, and a changed `headRefOid`
      restarts resolution before a GitHub mutation.
- [x] Branch matching recognizes only hyphen-delimited `issue-<N>` tokens and exact
      `/`-separated `NNN-slug` components; direct and indirect results are deduplicated.
- [x] Ambiguity lists ordered `path — Issue #N` or `path — sin Issue` candidates and pauses before
      any GitHub write. Invalid explicit selectors stop without writes.
- [x] With no approved spec, an explicitly accepted limited review retains normal comment handling,
      publishes `Spec: none`, does not assess acceptance criteria or emit `ready`, and reports
      `limited review; no contractual verdict`.

## Interface contracts

```text
pr-review
pr-review <positive PR number>
pr-review --spec <NNN|slug>
pr-review <positive PR number> --spec <NNN|slug>
```

The PR metadata request includes `closingIssuesReferences`, `headRefName`, and `headRefOid`.
Candidate choices are rendered in ascending path order as `specs/<path> — Issue #<N>` or
`specs/<path> — sin Issue`.

## Architecture boundaries

`skills/pr-review/SKILL.md` owns the complete portable resolution algorithm. The Claude command and
reviewer agent only route to and summarize that source of truth. Remote GitHub reads and writes stay
in the workflow; the local checkout, hooks, and read-only code reviewer do not participate in PR
contract resolution.

## Functional core

The resolver is a deterministic decision over immutable PR metadata and remote spec metadata:
canonical candidates, an optional selector, direct branch candidates, indirect branch candidates,
and all approved candidates. It produces exactly one of a selected approved spec, a selection prompt,
a fail-closed error, or an offered no-contract review. GitHub mutations occur only after that result
is accepted.

## Data model

```yaml
status: approved
issue: 17 # optional; absent for legacy fallback specs
```

```text
headRefName: feature/issue-17/003-gracefully-resolve-ambiguous-pr-to-spec-association
headRefOid: <remote commit SHA>
```

## Test plan

- Test the four valid invocations and invalid argument rejection.
- Test canonical → explicit → branch → discovery precedence, strict branch patterns, ambiguity,
  legacy inclusion, and draft/superseded exclusion.
- Test remote `headRefOid` source-of-truth wording, fail-closed selectors, pre-write pauses, and the
  limited-review summary and verdict.
- Run the Node suite, `git diff --check`, Claude validation, and clean Codex marketplace install.

## Risks

- A stale or local spec could produce a wrong review; reading only `headRefOid` prevents this.
- A permissive branch match could select an unrelated contract; exact component patterns avoid it.
- A limited review could be mistaken for contractual approval; the required `Spec: none` and fixed
  no-contract verdict make that boundary explicit.
