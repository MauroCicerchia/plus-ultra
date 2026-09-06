---
title: Codex local dogfooding
status: approved
issue: 44
created: 2026-09-06
---

# 006 — Codex local dogfooding

## Problem

Codex developers need to test unreleased Plus Ultra changes, but altering versioned manifests for a
local install would create an accidental release mismatch and pollute the working tree.

## Goals / Non-goals

**Goals**

- Stage a Git-included source snapshot under `.context/` with a unique local-only SemVer build
  suffix.
- Switch Codex between the local development marketplace and the stable marketplace safely.
- Preserve every versioned source manifest throughout refresh and restore.

**Non-goals**

- Publish a local snapshot, alter a release version, or support arbitrary marketplace names.
- Delete a development marketplace that does not point to this script's managed staging root.

## Acceptance criteria

- [x] `node scripts/codex-local.mjs refresh` validates source packaging before staging and creates
      `<release>+codex.local-YYYYMMDD-HHMMSS` versions only in the copied manifests.
- [x] Staging includes only tracked or unignored untracked files and excludes `.git`, `.context`,
      and ignored secrets.
- [x] Staging is completed in a temporary directory before replacement; a foreign
      `plus-ultra-dev` marketplace stops with no deletion.
- [x] Refresh removes the stable installation, installs the local `plus-ultra-dev` marketplace,
      and tells the developer to open a new thread.
- [x] `restore` removes only the managed local marketplace/staging, updates or adds stable
      marketplace metadata, reinstalls `plus-ultra@plus-ultra`, and tells the developer to open a
      new thread.
- [x] Temporary Git fixtures and a fake Codex executable verify safe copy, suffix uniqueness,
      repeated refresh, command ordering, conflict handling, restore, and a clean source tree.

## Interface contracts

```text
node scripts/codex-local.mjs refresh
node scripts/codex-local.mjs restore
```

The managed staging root is `.context/codex-dev-marketplace`. `refresh` exposes it as marketplace
`plus-ultra-dev`; `restore` returns the installation to `plus-ultra`.

## Architecture boundaries

The package validator guards source input. `codex-local.mjs` owns Git snapshotting, local staging,
and Codex CLI orchestration. The Codex CLI is the external side-effect boundary, isolated behind
one command runner.

## Functional core

Git's `ls-files -co --exclude-standard` determines an immutable copy set. Version derivation,
managed-root comparison, and local marketplace JSON construction are deterministic from explicit
inputs; filesystem replacement and Codex commands are side effects.

## Data model

The source version remains `X.Y.Z`. Staged copies use `X.Y.Z+codex.local-YYYYMMDD-HHMMSS`. The
development marketplace points only at `./plugins/plus-ultra` within the managed staging root.

## Test plan

Create temporary Git repositories plus a fake `codex` executable. Assert source-copy selection,
ignored-secret exclusion, all staged suffixes, repeat uniqueness, command sequence, conflict abort,
restore behavior, and unchanged source manifests. Run refresh/restore with a temporary `CODEX_HOME`
and confirm a source manifest diff remains empty.

## Risks

An interrupted Codex operation can leave a local marketplace installed, but source manifests stay
unchanged and `restore` provides an explicit recovery path. A development marketplace owned by
another root is never removed automatically.
