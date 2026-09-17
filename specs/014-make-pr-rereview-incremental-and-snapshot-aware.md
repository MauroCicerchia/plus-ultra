---
title: Make PR re-review incremental and snapshot-aware
status: approved
issue: 66
created: 2026-09-17
---

# 014 — Make PR re-review incremental and snapshot-aware

## Problem

A repeated Plus Ultra PR review rediscovers broad, immutable evidence even when a small correction
landed after the prior review. The current canonical summary and review threads are durable, but
they do not record a compact, validated review snapshot that can safely bound a re-review.

## Goals / Non-goals

**Goals**

- Persist a compact versioned snapshot in the authenticated reviewer's canonical summary.
- Make the local context reducer identify a safe incremental-review candidate and its remote delta.
- Reuse only structurally unchanged state; re-check unresolved findings against fresh evidence.
- Fall back to a full review whenever state, history, contract, base, or impact is unsafe.
- Measure a small-fix re-review against a fixed control plugin and target at least 30% lower usage.

**Non-goals**

- Cache semantic correctness across changed or ambiguously dependent source.
- Add a database, consumer-project cache, dependency, hosted service, or CI benchmark gate.
- Weaken remote-head freshness, contract resolution, summary, deduplication, or human integration
  boundaries.

## Acceptance criteria

- [ ] A canonical summary can contain one valid v1 snapshot tied to its repository, PR, remote head,
      base reference/SHA, and selected approved contract path/SHA.
- [ ] `pr-review-context` emits a compact incremental candidate only for an authenticated reviewer's
      valid prior snapshot with a same-base, ancestor-related head and unchanged approved contract.
- [ ] Missing, malformed, oversized, foreign-author, changed-contract, changed-base, or divergent
      snapshot state yields a deterministic full-review disposition without exposing comment bodies.
- [ ] Incremental instructions re-read unresolved findings and current delta evidence before a
      resolution; ambiguous dependency impact requires a full review.
- [ ] First-review, limited-review, stale-head, pagination, canonical-summary, and deduplication
      protections retain their current behavior.
- [ ] The local small-fix A/B probe reports exact total-token reduction when available, otherwise
      observed visible-context-byte reduction, and reports whether it meets 30%.

## Interface contracts

The canonical summary may include exactly one hidden line:

```text
<!-- plus-ultra:pr-review:snapshot:v1 <base64url(canonical-json)> -->
```

The decoded v1 JSON contains immutable PR provenance, approved contract identity, ordered reviewed
paths, compact finding anchors/fingerprints, and optional evidence digests; it excludes finding and
summary bodies. Encoded snapshots are capped below GitHub's comment limit. A summary still publishes
when the cap prevents a snapshot.

`node scripts/context-reducers.mjs pr-review-context` keeps its existing arguments and adds the
following response member:

```text
incremental: {
  disposition: "candidate" | "full",
  reason: <stable reason>,
  prior: <compact snapshot identity | null>,
  delta: <previous-head/current-head/changed-files | null>
}
```

The benchmark command gains a manual PR re-review A/B probe that accepts an explicit baseline Git
SHA plus the existing model and reasoning options, writes artifacts only under `.context/`, and
does not create a CI gate.

## Architecture boundaries

`scripts/context-reducers/core.mjs` owns pure snapshot encoding, parsing, validation, and
eligibility decisions. `github.mjs` remains the `gh` adapter for immutable comparisons and comment
retrieval. `context-reducers.mjs` composes those pieces and returns compact JSON. The portable
`pr-review` skill consumes the result and retains semantic dependency judgment. Benchmark adapters
own temporary snapshots and process execution; benchmark core remains pure.

## Functional core

Snapshot and eligibility functions use immutable inputs and explicit `{ ok, value }` / structured
failure results. They deterministically order paths and findings before encoding. Network calls,
GitHub API comparisons, summary mutation, temporary worktrees, and Codex execution remain adapter
side effects.

## Data model

Snapshot v1 is durable only inside the canonical GitHub summary. It stores no local path, raw
comment, verification log, or mutable cache. Its identity includes reviewer ownership and is
revalidated at every run. Benchmark raw control/candidate artifacts are local unversioned data
under `.context/benchmarks/`.

## Test plan

- Unit-test v1 codec/schema ordering, size cap, malformed data, ownership, and eligibility reasons.
- Integration-test reducer output for candidate, first review, base/contract/history failures,
  head drift, and incomplete pagination.
- Contract-test portable review instructions and fake GitHub postconditions for one snapshot update,
  fresh finding resolution, and conservative fallback.
- Test the benchmark probe's matched control/candidate inputs, metric fallback, and 30% result.
- Run focused and full Node tests, context-budget and packaging checks, both Claude validations,
  `git diff --check`, and the manual A/B probe before requesting review.

## Risks

Persisted state can incorrectly narrow a review. The implementation therefore treats every parse,
provenance, ancestry, base, contract, and impact uncertainty as a full review, while retaining
existing stop-before-write behavior for unreliable current GitHub reads. The snapshot is replaced
atomically with the canonical summary after the final remote-head freshness check; a failed or
oversized snapshot simply disables future reuse.
