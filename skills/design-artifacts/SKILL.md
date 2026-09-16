---
name: design-artifacts
description: Use when creating, resolving, approving, or reviewing durable visual design artifacts for Issues, revising an approved Pencil design, or maintaining DESIGN.md.
---

# plus-ultra:design-artifacts

Keep durable visual decisions in numbered manifest and `.pen` pairs; keep reusable visual rules in
`DESIGN.md`. Pencil is optional and external.

## Core safety

Read an existing `docs/product.md` as read-only context. If it is absent, continue normally and
never create or mutate it. A durable contradiction pauses the affected workflow for an explicitly
approved focused `plus-ultra:product-discovery` update.

Design pairs begin as drafts and are never silently overwritten. Only explicit human approval of
reviewed evidence may approve a pair; an implementation request, plan, successful check, or agent
recommendation is not approval. Keep resolution and review read-only. If Pencil is unavailable,
the wrong file is open, or evidence is missing, pause only affected visual authoring, review, or
approval; do not fabricate verification.

## Load the operational reference

Read [`references/design-operations.md`](./references/design-operations.md) before resolving an
Issue, creating, approving, revising, or reviewing a pair, or changing `DESIGN.md`. It defines the
manifest schema, deterministic resolution, Pencil operations, lifecycle transitions, templates,
and worked examples. Preserve its explicit routing and human-approval rules at the point of work.
