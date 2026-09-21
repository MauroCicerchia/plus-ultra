---
name: pencil-design
description: Use when creating, editing, validating, or consuming a Pencil feature-design artifact.
---

# Pencil feature design

`DESIGN.md` is the approved product-level visual direction; a `.pen` becomes the approved
feature-level reference after human approval. Pencil is a reference tool, not a design platform.

## Preflight

1. Discover the available Pencil MCP capability. The macOS application is named `Pen`.
2. Ensure Pen has an active document before any Pencil MCP call; `read_skill` and `get_app_state`
   are unavailable until one is open. Own this yourself: launch Pen when it is closed; create a
   blank document in Pen for a new design; open that exact file in Pen for an existing repository
   `.pen`. Drive the environment's local UI or OS automation when no MCP call can do it.
3. Ask the human only when you cannot do that safely — no such automation, blocked permissions, or
   an undeterminable target. Never interrupt merely because Pen is closed or has no document open.
4. Once a document is active, use Pencil's native `read_skill` material to load its current skill,
   schema, execute documentation, and the relevant UI guide, and follow them.

Never read, inspect, parse, or mutate `.pen` contents with ordinary filesystem tools. Generic file
checks may establish that the path exists and is tracked, but Pencil owns the document contents.

## Construct

- Map relevant settled `DESIGN.md` tokens into Pencil variables before composing feature screens.
- Use named top-level frames for important screens and states; give meaningful nodes
  human-readable names.
- Use `placeholder: true` only while actively constructing a root frame; remove it when that frame
  is complete.
- Prefer flex or dynamic layout where appropriate.
- Build incrementally with focused `execute` calls. Fix completed nodes directly instead of
  recreating them.

## Current compatibility notes

**Render-settle.** After a meaningful mutation, inspect structure and bounds with `Get`. Then make
a separate `execute` call containing the screenshot request. An immediate blank or stale screenshot
is not authoritative.

**Copy-edit.** After `Copy`, traverse the copied subtree with `Get`, rediscover the copied
descendants' new IDs, and update those IDs directly. Do not rely on descendant-name overrides
inside `Copy`.

**Save-reopen.** Save repository designs using the basename without `.pen`: give Save As the
repository-relative path without the extension because Pen currently appends `.pen`. Reopen the
saved repository path explicitly before final MCP validation.

## Validate and hand off

Before human approval, perform both audits:

- **Structural:** no remaining `placeholder: true` frames; no reported `ctx.problems`; expected
  top-level frames and sensible bounds.
- **Visual:** screenshot every relevant screen/state and inspect hierarchy, density,
  selected/unselected states, responsive behavior, validation and success states, and accidental
  visual additions.

Neither audit replaces the other.

Then hand off in order: present the refined Issue proposal and the validated design together, so
one explicit human approval covers both; ensure the approved artifact is saved at
`designs/<issue>-<slug>.pen` as Save-reopen describes; persist it through the repository's normal
Git workflow; and record its path and Git reference in the Issue. Only once it is
durably reachable through Git and present in the later implementation worktree is implementation
unblocked on the design artifact. While it remains unintegrated, refinement is complete but implementation is
blocked: the Issue may carry `Approved design pending durable Git reference.` until the real path
replaces it. State that dependency rather than copying, integrating, or recreating it.

Do not add a Pencil parser, wrapper API, manifest, resolver, lifecycle manager, token-sync layer,
preview pipeline, generated design system, or design versioning scheme. Use Pencil's native
operations directly and remove compatibility notes when its documented behaviour makes them
obsolete.
