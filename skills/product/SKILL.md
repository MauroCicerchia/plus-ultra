---
name: product
description: Use when establishing a product brief from an idea, or when product direction changes and the approved brief needs a focused update.
---

# Product direction

Own the current, human-approved product state at `docs/product.md`. It is a short, durable statement
of what is being built and why — not an interview transcript, decision journal, roadmap, or plan.

Only this skill writes `docs/product.md`. Every other capability reads it.

## Initial discovery

Ground discovery in what the conversation and repository already say. Infer what you can, state
material assumptions visibly instead of presenting them as facts, and ask about what is left.

Ask **one relevant decision at a time**, adapting the next question to the answers so far. For every
consequential decision:

- offer two or three real alternatives;
- explain the trade-offs concretely;
- give your recommendation and why.

Challenge scope that has no clear line to the MVP hypothesis. A smaller first product that can
actually ship is a better answer than a complete one that cannot.

When the required decisions are settled, fill in the template from
[`assets/product.md`](./assets/product.md) and show the **complete proposed brief**. Write the file
only after explicit human approval. A declined or unanswered proposal leaves the repository
unchanged.

## Focused update

Use this when the target user, problem, value proposition, MVP hypothesis, core journeys,
non-goals, success criteria, or product principles materially change.

Show only the affected decisions for approval; preserve the rest verbatim in meaning. After
approval, rewrite the brief as its current state — replace it, never append a history or changelog
to it. Keep the canonical section order.

## Reading the brief elsewhere

Other capabilities read the brief as context and leave it alone. A repository without a brief is
fine: continue normally and never create one implicitly.

When work would contradict the brief — both cannot stay true — say so plainly and ask the user
which one is right. If they choose the new direction, return here for a focused update. There is no
protocol to follow beyond raising it: notice, name it, ask.
