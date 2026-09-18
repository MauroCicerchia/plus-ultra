---
name: implement-issue
description: Use when taking a GitHub Issue end to end — clarify what is material, plan, implement, test, review, and open or update a pull request that stops at human integration.
---

# Implement an Issue

Take one GitHub Issue to a pull request ready for human review, then stop. The Issue is the
behavioural contract: its Context, Goal, and Acceptance Criteria define done. A separate spec is
optional.

## 1. Check the Issue is a Story, then load what it needs

The implementation unit is a Story. If the Issue carries `type:epic`, stop: an Epic is a container,
not a unit of work. Route it to `plus-ultra:refine-issue` or `plus-ultra:roadmap` for decomposition.
A `type:story` Issue, or an untyped Issue in an existing repository, proceeds normally.

Read the Issue with `gh issue view <number>`, its parent if any, `docs/product.md` when present, and
the repository areas the change touches. Do not sweep the whole repository or restate the Issue.

## 2. Resolve ambiguity deliberately

**Ask the human** when a decision is material: product behaviour, user-visible UX, security or
privacy, data shape or migration, a public or cross-service contract, or anything else externally
observable.

**Assume and proceed** only for low-impact, reversible implementation details — internal naming,
file layout, private helper structure, test organisation. State each assumption in the PR.

Ask once, batched, with a recommendation per question. Never ask what the Issue answers. If a
decision contradicts `docs/product.md`, say so and ask; do not edit the brief here.

## 3. Choose depth

| Depth | When | Path |
| --- | --- | --- |
| **Small** | Localized and understood; no material decision | implement → focused tests → PR |
| **Normal** | Significant behaviour, or several files or modules | short plan → implement → tests → review when warranted → fix → PR |
| **High-risk** | Auth, authorization, payments, destructive data, sensitive migration, concurrency, critical infrastructure | technical contract → plan → stronger verification → **mandatory** review → PR |

Unresolved uncertainty raises depth; it never lowers it. [`references/depth.md`](./references/depth.md)
holds each depth's controls, where a design reference lives, and when a spec earns its cost.

## 4. Design checkpoint

Non-UI work reads nothing here. When the change touches a user interface, read root `DESIGN.md` if
it exists: approved product-level visual context. Build consistently with it, and never change its
product-level direction here.

Never invent significant interface direction while coding. If the work introduces or significantly
changes a user interface and refinement did not settle it, stop, reason about the UX, propose one
concrete direction, and get explicit human approval before implementing it.

## 5. Plan and implement

Work on a feature branch. Keep plans in `.context/`, which is local and never committed. Use
test-driven development where the project supports it, and follow the repository's own conventions
over any default.

When the change materially involves business rules, architecture, persistence, external
integrations, or side-effect isolation, read the engineering principles in `plus-ultra:conventions`.
Skip them for ordinary small and local work.

## 6. Verify

Run the repository's own test, typecheck, lint, and build scripts; do not add a verification
wrapper. Every acceptance criterion needs evidence — a test, or a stated manual check and its
result. A failing or unrun check means unverified: say so rather than claim otherwise.

## 7. Independent review

Dispatch an independent reviewer following `plus-ultra:code-review` against the Issue, optional
spec, and diff. **Mandatory** for high-risk work. For normal work use it **when warranted** —
non-obvious logic, wide blast radius, or low confidence. Small work skips it by default. Without a
separate agent, review as a deliberate read-only pass over the diff.

Fix substantiated blockers. Report, but do not silently act on, findings you judge incorrect.

## 8. Pull request, then stop

Create or update the PR from [`assets/pr-body.md`](./assets/pr-body.md) and link the Issue. Report
the branch, PR URL, what was verified, open assumptions, and what to review first.

`plus-ultra:integration-boundary` applies: never merge, enable auto-merge, push the default branch,
or publish a release or tag. End at **ready for review** and stop.

Close with one line of harness feedback only when this Issue exposed real friction in Plus Ultra
itself. Never file it.

