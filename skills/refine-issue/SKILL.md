---
name: refine-issue
description: Use when a GitHub Issue needs to become ready to implement — resolving product ambiguity, settling significant UI direction, and writing acceptance criteria.
---

# Refine an Issue

This is the main collaboration point before implementation. When refinement is done well, building
the Issue should need few or no further human decisions.

Accept one positive Issue number. Read the Issue, labels, parent, touched areas, and `docs/product.md`
when present. If it conflicts with the brief, say so and ask. Follow `plus-ultra:conventions` for
the required `gh` version and check write permission before any GitHub write.

## What refinement decides

1. **Product ambiguity.** Identify decisions the Issue leaves open that would change what gets
   built. Ask about those, with a recommendation for each. Do not ask questions the repository or
   the brief already answers, and do not ask about reversible implementation details.
2. **Acceptance criteria.** Write criteria a reviewer can check against a diff: observable
   behaviour, not implementation steps. These become the contract that implementation and review
   both work from.
3. **Design checkpoint.** Decide whether the Story involves significant visual or interaction
   decisions. If there is no significant UI, say so, move on, and read no design context at all.
   If there is, read root `DESIGN.md` when it exists — it is the approved product-level visual
   direction — and produce one concrete proposal consistent with that direction. When Pencil
   tooling is available and useful,
   a Pencil file is the preferred reference: use `plus-ultra:pencil-design` and save it at
   `designs/<issue>-<slug>.pen`. A mockup, screenshot, or described reference remains the fallback
   when Pencil is unavailable or clearly not useful. Get explicit human approval of the concrete
   feature design and record its reference in the Issue. Feature-level design never touches
   `DESIGN.md`.
   Where the Story genuinely needs **new product-level direction**, say so, propose that direction
   with the smallest corresponding `DESIGN.md` change, and get explicit human approval for both.
   Only then edit `DESIGN.md` — minimally, keeping every unaffected part verbatim — and still record
   the feature's approved reference in the Issue.
   A repository-native approved design must be durably reachable through Git before a later
   implementation session depends on it. Refinement may finish while implementation remains blocked
   on that integration or another Issue; record the dependency.
4. **Whether a spec is warranted.** Note in the Issue when complexity or risk justifies a separate
   technical contract. Do not create one here; `plus-ultra:implement-issue` decides and writes it.

## Proposal

Classify the Issue as a Story or an Epic from its scope. An Epic may be refined — its context, goal,
and boundaries are worth sharpening — but it is never ready to implement: finish by proposing the
Stories it decomposes into and hand those to `plus-ultra:roadmap`. Only a Story, or an untyped Issue
in an existing repository, may be marked ready for `plus-ultra:implement-issue`.

Propose a title, and labels, milestone, or parent only where the available context supports them. Replace the body with this structure:

```markdown
## Context

## Goal

## Scope
### In
### Out

## Acceptance Criteria

## Dependencies

## Design
[Approved direction and its reference, or "No significant UI".]

## Risks and open questions
```

Keep anything still uncertain as an explicit open question rather than inventing a requirement.

Do not edit the Issue, add labels, set a milestone, or create a parent-child link until the user
gives **explicit confirmation** of the displayed proposal. On confirmation, make exactly those
edits and report the Issue URL. GitHub's edit history preserves the original intake.

Finish by saying whether the Issue is ready to implement. Hand a ready Story to
`plus-ultra:implement-issue`; hand a refined Epic to decomposition instead.
