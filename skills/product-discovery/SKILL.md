---
name: product-discovery
description: Use when establishing or strategically updating a durable product brief, or when product direction needs focused discovery before work continues.
---

# plus-ultra product discovery

Own the current, human-approved product state at `docs/product.md`. Only
`plus-ultra:product-discovery` may create, write, or strategically update that file. It is not an
interview transcript, decision journal, roadmap, or implementation plan.

## Modes and ownership

Use one of these modes deliberately:

1. **Initial adaptive discovery** establishes a missing brief.
2. **Focused strategic update** changes an existing brief after a requested strategic change or a
   durable contradiction.
3. **Read-only consumption mode** reads an existing brief as context without changing it.

Other workflows are read-only consumers: they may apply a present brief as context, but must not
create, edit, append to, or implicitly create `docs/product.md`. A repository without a brief is
read-only-compatible: do not create one implicitly, and let ordinary existing-repository work
continue normally.

## Initial adaptive discovery

Ground discovery in relevant conversation and repository context. State material assumptions
visibly rather than presenting them as facts. Ask one relevant decision at a time; adapt the next
decision to what is already known.

For every consequential decision, offer two or three alternatives, explain the trade-offs, and
give a recommendation. Challenge any requested scope that lacks a clear connection to the MVP
hypothesis; do not silently encode it as a product decision.

When the required decisions are clear, fill in the complete canonical template from
[`assets/product.md`](./assets/product.md). Show the full visible proposal before creating the
file. Write `docs/product.md` only after explicit human approval. If the proposal is declined or
unapproved, leave the file unchanged.

## Focused strategic update

Use this mode for a material revision to the target user, problem, alternative, value proposition,
MVP hypothesis, journeys, non-goals, success criteria, or product principles and constraints.

Identify the affected decisions. A focused update shows only affected decisions for explicit human
approval, while preserving unaffected sections—all canonical sections not affected—verbatim in
meaning.
Do not write until approval; a declined or unapproved update leaves `docs/product.md` unchanged.

After approval, rewrite the complete brief as its current state. Replace the prior document rather
than appending a journal, history, transcript, or decision log. Retain exactly the canonical
section sequence from [`assets/product.md`](./assets/product.md).

## Read-only consumption

When a brief exists, read it as product context and leave it unchanged. If proposed work creates a
durable contradiction—both the brief and the work cannot materially remain true—pause the current
workflow and route to focused strategic update. Resume only after the resulting update has explicit
human approval. Leave implementation-level choices with the current workflow.

## Canonical brief

The sole durable brief path is `docs/product.md`. Start it from
[`assets/product.md`](./assets/product.md), retain its title and exact level-2 heading order, and
write only the current approved product state.
