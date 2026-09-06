---
title: Validate plugin packaging
status: approved
issue: 42
created: 2026-09-06
---

# 004 — Validate plugin packaging

## Problem

The three agent manifests and marketplace metadata can drift independently. A malformed manifest,
portable-path violation, or accidental local dogfooding version would only be discovered after an
installation attempt.

## Goals / Non-goals

**Goals**

- Validate the versioned plugin package without dependencies.
- Reject invalid JSON, inconsistent metadata and versions, non-portable paths, and local Codex
  suffixes in source manifests.
- Reuse the validator from CI and later release tooling.

**Non-goals**

- Add a package manager manifest, npm publication, or release behavior.
- Install or mutate any local plugin marketplace.

## Acceptance criteria

- [x] `node scripts/validate-packaging.mjs` produces deterministic output and exits 1 for invalid
      JSON, invalid/inconsistent metadata, divergent versions, local Codex suffixes, or invalid
      plugin paths.
- [x] All skills, hooks, and marketplace source paths are relative, contained by the plugin root,
      and exist.
- [x] When present, `version.txt` and `.release-please-manifest.json` match the manifest version.
- [x] Node tests cover valid metadata plus version, JSON, local-suffix, path, and release-carrier
      failures.
- [x] Pull requests run the Node test suite, package validation, and Claude marketplace validation
      on Node 24 through a reusable workflow.

## Interface contracts

```text
node scripts/validate-packaging.mjs [plugin-root]
```

The command defaults to the current directory. It writes `Packaging validation passed.` on success;
otherwise it writes a sorted list of validation errors to stderr and exits 1.

## Architecture boundaries

`scripts/validate-packaging.mjs` owns only source-package inspection. CI invokes it as an adapter;
release and dogfooding tooling may consume its exported validation function but own their own side
effects.

## Functional core

`validatePackaging(root)` derives a sorted, immutable error list from manifest content and the
filesystem rooted at `root`. `runValidation(root)` is the narrow CLI side-effect boundary.

## Data model

The source of truth is the `version` field in the Claude, Codex, and Cursor plugin manifests.
Optional release carriers use the same version string.

## Test plan

Use temporary package fixtures to test the CLI for success and each validation failure. Run the
full Node suite, package validation, whitespace checks, and Claude plugin validation.

## Risks

Symlinks can make a textual relative path escape the package. The validator resolves existing paths
before checking containment. A future manifest field may need explicit validation when its platform
contract adds another plugin-relative path.
