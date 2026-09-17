# Handoff operations

## Build and validate the header

Use the compact header from the core skill. A reference is `none` when it does not apply or cannot
be resolved; never replace it with a copied artifact. For a tracked file, record its Git blob SHA
at the header's source commit. For an untracked local file, record `sha256:<content-digest>`.
Resolve the receiver's file at that revision before relying on it. A changed commit, missing path,
or mismatched revision is not reusable evidence.

Keep `scope` as the smallest useful list of file paths, named document sections, receipt IDs, or
immutable remote evidence identifiers. Keep `open_decisions` as `none` or the unanswered decisions
that could change the receiver's work. Do not add a summary agent merely to restate a source the
receiver can read directly. Reuse a deterministic map or index only when its source revision still
matches.

## Phase minimums

| Phase | Read first | Do not load by default |
| --- | --- | --- |
| planner | Issue, present `docs/product.md`, relevant repository architecture, and risk classification | prior test logs and implementation reasoning |
| implementer | approved spec, implementation plan, risk classification, focused files, and applicable design | planning transcript and unrelated repository map |
| verifier | source snapshot, required commands and risk controls, then focused verification receipts | product-discovery history and implementation rationale |
| reviewer | approved contract, immutable remote diff metadata, verification evidence, and existing finding metadata | implementer chain of thought and unneeded comment bodies |

For a review, remote base/head and contract identity are authoritative. The local compact reducer,
when available, is metadata rather than a substitute for required source evidence.

## Selective expansion

Expand only the missing source or evidence needed to answer the trigger:

- A missing or stale reference, revision mismatch, or unresolved decision: load the referenced
  authority or stop for the decision.
- A changed path outside `scope`, contract or dependency ambiguity, or risk escalation: load the
  affected architecture, contract sections, and risk controls; do not infer safety from the old
  scope.
- Failed or unknown verification: read the referenced receipt and retained failure evidence, not
  unrelated successful logs.
- A remote head, base, or contract change during review: discard affected review conclusions and
  restart the required current-head collection.

On interruption or resume, reconstruct the header from durable sources: the Issue, source snapshot,
approved artifacts, and receipts. Do not rely on conversational memory, a copied handoff, or a
local state file.

## Rigor-aware depth

| Rigor | Context and reasoning depth |
| --- | --- |
| FAST | Prove the change is localized; read only its focused source, target verification, and classification. Do not require a full-repository map or broad review unless an expansion trigger appears. |
| STANDARD | Read the normal scoped phase artifacts in the table and follow the established plan, TDD, verification, and review lifecycle. |
| CRITICAL | Read STANDARD sources plus the complete de-duplicated controls and evidence for every detected risk dimension before the relevant decision. |

FAST savings never bypass commit guardrails. No receiver silently lowers a supplied level or drops a
dimension; `plus-ultra:workflow-risk` remains the authority for an explicit override.

## Ownership

`plus-ultra:spec-conventions` owns artifact locations, `plus-ultra:workflow-risk` owns
classification, `plus-ultra:verification` owns receipts, and `plus-ultra:pr-review` owns review
safety and publishing. Issue #22 may later orchestrate or persist these references. This contract
does neither, and it introduces no command, hook, agent, cache, or platform-specific behavior.
