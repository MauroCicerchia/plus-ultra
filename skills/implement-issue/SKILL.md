---
name: implement-issue
description: Use when taking a GitHub Issue end to end — clarify what is material, plan, implement, test, review, and open or update a pull request that stops at human integration.
---

# Implement an Issue

Take one GitHub Issue to a pull request ready for human review, then stop. The Issue is the
behavioural contract: its Context, Goal, and Acceptance Criteria define done. A separate technical
spec is optional and usually unnecessary.

## 1. Load only what the work needs

Read the Issue with `gh issue view <number>`, its parent if any, `docs/product.md` when present, and
the repository areas the change touches. Do not sweep the whole repository or restate the Issue.

## 2. Resolve ambiguity deliberately

**Ask the human** when a decision is material: product behaviour, user-visible UX, security or
privacy, data shape or migration, a public or cross-service contract, or anything else externally
observable.

**Assume and proceed** only for low-impact, reversible implementation details — internal naming,
file layout, private helper structure, test organisation. State each assumption in the PR.

Ask once, batched, with a recommendation per question. Never ask what the Issue already answers. If
a decision contradicts `docs/product.md`, say so and ask; do not edit the brief here.

## 3. Choose depth

| Depth | When | Path |
| --- | --- | --- |
| **Small** | Localized and understood; no material decision | implement → focused tests → PR |
| **Normal** | Significant behaviour, or several files or modules | short plan → implement → tests → review when warranted → fix → PR |
| **High-risk** | Auth, authorization, payments, destructive data, sensitive migration, concurrency, critical infrastructure | technical contract → plan → stronger verification → **mandatory** review → PR |

Unresolved uncertainty raises depth; it never lowers it.
[`references/depth.md`](./references/depth.md) holds the controls each depth expects and when a
separate spec earns its cost.

## 4. Design checkpoint

If the work introduces or significantly changes a user interface and refinement did not settle it,
stop before implementing it. Reason about the UX, produce one concrete proposal — a Pencil file,
mockup, screenshot, or described reference — and get explicit human approval of the direction. Keep
the approved reference wherever it is cheapest: an Issue comment, `designs/<issue>-<slug>.pen`, or a
link. Never invent significant interface direction while coding.

## 5. Plan and implement

Work on a feature branch. Keep plans in `.context/`, which is local and never committed. Normal and
high-risk work gets a written plan first. Use test-driven development where the project supports it.
Follow the repository's own conventions over any default.

When the change materially involves business rules, architecture, persistence, external
integrations, or side-effect isolation, read the engineering principles in `plus-ultra:conventions`
first. Skip them for ordinary small and local work.

## 6. Verify

Run the repository's own test, typecheck, lint, and build scripts; do not add a verification
wrapper. Every acceptance criterion needs evidence — a test, or a stated manual check and its
result. A failing or unrun check means unverified: say so rather than claiming otherwise.

## 7. Independent review

Dispatch an independent reviewer following `plus-ultra:code-review` against the Issue, optional
spec, and diff. **Mandatory** for high-risk work. For normal work use it **when warranted** —
non-obvious logic, wide blast radius, or low confidence. Small work skips it by default. Without a
separate agent, review as a deliberate read-only pass over your own diff.

Fix substantiated blockers. Report, but do not silently act on, findings you judge incorrect.

## 8. Pull request, then stop

Create or update the PR from [`assets/pr-body.md`](./assets/pr-body.md) and link the Issue. Report
the branch, PR URL, what was verified, open assumptions, and what to look at first.

`plus-ultra:integration-boundary` applies: never merge, enable auto-merge, push the default branch,
or publish a release or tag. End at **ready for review** and stop.

Close with one line of harness feedback only when this Issue exposed real friction in Plus Ultra
itself, such as a missing acceptance criterion that forced an avoidable interruption. Report it;
never file it.
