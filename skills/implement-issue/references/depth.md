# Depth controls

Read this when choosing between small, normal, and high-risk work, or when deciding whether a
separate technical spec is worth writing. It is guidance for one change, not a durable
classification: nothing here is persisted, re-derived at ship time, or handed between agents.

## Small

Localized, understood, and free of material product, UX, security, or data decisions. The path is
implement → focused tests → PR.

- Focused tests covering the changed behaviour.
- The repository's complete verification still has to pass on the final head.
- No written plan, no spec, no independent review by default.

Escalate to normal the moment the change grows past the area you first scoped, or a question you
cannot answer from the Issue appears.

## Normal

Significant behaviour, or a change spanning several files or modules. The path is short plan →
implement → tests → review when warranted → fix → PR.

- A short written plan before implementing.
- Tests for each acceptance criterion, plus the repository's complete verification on the final
  head, and broader checks at a meaningful integration checkpoint when risk warrants them.
- Independent review **when warranted**: non-obvious logic, wide blast radius, a subsystem you have
  not touched before, or low confidence in your own diff. Say which of these applied, or that none
  did and you skipped review.

## High-risk

Triggered by authentication, authorization, payments, destructive data operations, sensitive
migrations, concurrency, or critical infrastructure. The path is technical contract → plan →
stronger verification → mandatory review → PR.

- A written technical contract before implementing — see the spec section below.
- The normal controls, plus the ones the trigger demands:

| Trigger | Verification it demands |
| --- | --- |
| Authentication, authorization | Permitted and denied cases across sessions, roles, and tenancy; integration coverage |
| Security boundary | Abuse cases and trust-boundary validation |
| Payments | Idempotency, retries, duplicates, amounts, currencies, rounding |
| Migration, destructive data | Representative fixtures; roll-forward, rollback, scope, and recovery |
| Concurrency, persistence | Races, ordering, retries, atomicity, restarts, partial failure |
| Critical infrastructure | Configuration, permissions, degradation, recovery, rollback |

- Independent review is **mandatory** and cannot be waived by confidence.

## Verification cadence

Intermediate commits carry focused tests for the changed behaviour plus a typecheck or package check
scoped to the changed area. Widen that deliberately — at a risky integration checkpoint, or because
a high-risk trigger above demands more — not by habit, and never in place of the final run.

The repository's complete verification (`test`, `typecheck`, `lint`, and `build`, as available) is
mandatory on the final committed head before the change is ready for review, and again on the head
that follows blocker fixes. Independent review pins that exact head; a re-verified head is a new
head and needs its own review pass.

## Where a design reference lives

When the design checkpoint approves a direction, keep the reference wherever it is cheapest: a
comment, attached image or screenshot, or link. Pencil uses `designs/<issue>-<slug>.pen`; record its
path and Git reference on the Issue, and make it present in the later implementation worktree before
that session depends on it. Do not build a versioning scheme, manifest, or lifecycle around it.

## When a separate spec earns its cost

A refined Issue is the default contract. Write `specs/NNN-slug.md` only when a durable technical
decision has to exist before the code does:

- a significant architectural change;
- a complex public or cross-service contract;
- authentication, authorization, or another security boundary;
- a migration or data-integrity change;
- concurrency semantics that reviewers must be able to check against something.

A spec is a contract, not a plan or a journal: interfaces, boundaries, invariants, failure
behaviour, and a test plan. Keep it short, commit it with the change, and link the Issue. If you
cannot name which decision the spec settles, the Issue is enough — skip it.
