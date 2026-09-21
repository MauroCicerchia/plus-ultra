---
name: implement-issue
description: Use when taking a GitHub Issue end to end — clarify what is material, plan, implement, test, review, and open or update a pull request that stops at human integration.
---

# Implement an Issue

Take one GitHub Issue to a review-ready pull request, then stop. Its Context, Goal, and Acceptance
Criteria define done; a separate spec is optional.

## 1. Check the Issue is a Story, then load what it needs

The implementation unit is a Story. If the Issue carries `type:epic`, stop: an Epic is a container,
not a unit of work. Route it to `plus-ultra:refine-issue` or `plus-ultra:roadmap` for decomposition.
A `type:story` Issue, or an untyped Issue in an existing repository, proceeds normally.

Read it with `gh issue view <number>`, its parent, `docs/product.md` when present, and only the
repository areas it touches.

## 2. Resolve ambiguity deliberately

An explicitly approved refined Story satisfies generic product, design, and brainstorming approval
gates. Never reopen what the Issue, `docs/product.md`, `DESIGN.md`, or an approved design settled;
complementary methodologies supply mechanics, not approval gates.

**Ask the human** on a new material ambiguity: product behaviour, user-visible UX, security or
privacy, data shape or migration, a public or cross-service contract, or anything else externally
observable.

**Assume and proceed** only for low-impact, reversible implementation details. State them in the PR.

Ask once, batched, with recommendations. If a decision conflicts with `docs/product.md`, say so and
ask; do not edit the brief.

## 3. Choose depth

| Depth | When |
| --- | --- |
| **Small** | Localized and understood; no material decision |
| **Normal** | Significant behaviour, or several files or modules |
| **High-risk** | Auth, payments, destructive data, migrations, concurrency, critical infrastructure |

Unresolved uncertainty raises depth; it never lowers it. [`depth.md`](./references/depth.md) holds
each depth's controls and path, where a design reference lives, and when a spec is worth it.

## 4. Design checkpoint

Non-UI work reads nothing here. When the change touches a user interface, read root `DESIGN.md` if
it exists: approved product-level visual context. Build consistently with it, and never change its
product-level direction here. Never invent significant interface direction while coding. If
refinement did not settle it, propose one concrete direction and get explicit human approval before
implementing it.

If Design references a `.pen`, use `plus-ultra:pencil-design` to inspect that approved feature-level
reference. Do not redesign approved UI without new material ambiguity, use ordinary filesystem tools
on its contents, or recreate an unavailable durable reference.

## 5. Plan and implement

Work on a feature branch. Keep plans in `.context/`, which is local and never committed. Use TDD
where supported and follow repository conventions.

When the change materially involves business rules, architecture, persistence, external
integrations, or side-effect isolation, read the engineering principles in `plus-ultra:conventions`.
Skip them for ordinary small and local work.

## 6. Verify

Intermediate commits may run focused tests and a scoped typecheck or package check for the changed
area. The repository's full test, typecheck, lint, and build scripts are mandatory on the final
committed head before PR readiness; do not add a verification wrapper. Give every acceptance
criterion test or manual-check evidence. Say when a check failed or was not run.

## 7. Independent review

Dispatch an independent reviewer following [`code-review.md`](./references/code-review.md) against
the Issue, optional spec, and exact head. **Mandatory** for high-risk work. For normal work
use it **when warranted** — non-obvious logic, wide blast radius, or low confidence. Small work
skips it by default. Without another agent, make the same deliberate read-only pass.

Fix substantiated blockers, then require a final review pass over the resulting exact head. Report,
but do not silently act on, findings you judge incorrect.

## 8. Pull request, then stop

Create or update the PR from [`pr-body.md`](./assets/pr-body.md), link the Issue, and report the
branch, URL, verification, assumptions, and what to review first.

`plus-ultra:integration-boundary` applies: never merge, enable auto-merge, push the default branch,
or publish a release or tag. End at **ready for review** and stop.

Close with one line of harness feedback only when this Issue exposed real Plus Ultra friction.
Never file it.
