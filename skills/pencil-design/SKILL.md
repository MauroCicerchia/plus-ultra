---
name: pencil-design
description: Use when creating, editing, validating, or consuming a Pencil feature-design artifact.
---

# Pencil feature design

Use Pencil for feature-level references, not as a design platform inside Plus Ultra. `DESIGN.md` is
the approved product-level visual direction; a `.pen` becomes the approved feature-level reference
after human approval. Store it at `designs/<issue>-<slug>.pen`.

## Preflight

1. Discover the available Pencil MCP capability. The macOS application is named `Pen`.
2. Ensure Pen has an active document before any Pencil MCP call. `read_skill` and `get_app_state`
   are unavailable until one is open. For a new design, create a blank document in Pen first. For
   an existing repository `.pen`, open that exact file in Pen before operating on it.
3. Once a document is active, use Pencil's native `read_skill` material to load its current skill,
   schema, execute documentation, and the relevant UI guide. Follow those native instructions;
   this companion records only Plus Ultra's workflow knowledge.

Never read, inspect, parse, or mutate `.pen` contents with ordinary filesystem tools. Generic file
checks may establish that the path exists and is tracked, but Pencil owns the document contents.

## Construct

- Map relevant settled `DESIGN.md` tokens into Pencil variables before composing feature screens.
- Use named top-level frames for important screens and states, and give meaningful nodes
  human-readable names.
- Use `placeholder: true` only while actively constructing a root frame; remove it when that frame
  is complete.
- Prefer flex or dynamic layout where appropriate.
- Build incrementally with focused `execute` calls. Fix completed nodes directly instead of
  recreating them unnecessarily.

## Current compatibility notes

These are removable workarounds for current Pencil behaviour, not Plus Ultra abstractions.

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

An approved repository-native design must be durably reachable through Git and present in the later
implementation worktree before that session depends on it. Record its path and Git reference in the
Issue. If it remains on an unintegrated branch or PR, implementation is blocked; state that
dependency rather than copying, integrating, or recreating the design.

Do not add a Pencil parser, wrapper API, manifest, resolver, lifecycle manager, token-sync layer,
preview pipeline, generated design system, or design versioning scheme. Use Pencil's native
operations directly and remove compatibility notes when its documented behaviour makes them
obsolete.
