---
title: Automate SemVer releases
status: approved
issue: 43
created: 2026-09-06
---

# 005 — Automate SemVer releases

## Problem

Plus Ultra has no durable release baseline or automation to keep its shared plugin version,
changelog, tags, and GitHub Releases synchronized.

## Goals / Non-goals

**Goals**

- Establish `0.1.0` as the release baseline.
- Configure Release Please manifest mode for the root plugin.
- Keep all three plugin manifest versions in a release PR.
- Document stable Codex, Claude, and Cursor installation/update paths.

**Non-goals**

- Publish an npm package or use an external registry.
- Automatically approve or merge a release PR.

## Acceptance criteria

- [x] `version.txt`, the Release Please manifest, three manifests, and the changelog baseline agree
      on `0.1.0`.
- [x] Release Please uses the root `.` package with the `simple` strategy, `version.txt`, a single
      `plus-ultra` component, `vX.Y.Z` tags, and JSON `$.version` extra files for every manifest.
- [x] `fix` produces a patch; `feat` and breaking changes while pre-1.0 produce a minor.
- [x] Pushes to `main` invoke reusable validation before `googleapis/release-please-action@v4` with
      the required write permissions and `GITHUB_TOKEN`.
- [x] The Codex marketplace identity is `plus-ultra`; README and agent guidance document the
      supported Codex/Claude updates and Cursor marketplace refresh.

## Interface contracts

```text
version.txt                         # current product SemVer
.release-please-manifest.json       # { ".": "X.Y.Z" }
release-please-config.json          # root manifest-mode configuration
```

Release Please creates or updates a release PR from conventional commits. Merging that PR creates
the tag and GitHub Release; normal feature merges only update the release PR.

## Architecture boundaries

The reusable CI workflow validates source packaging. The release workflow composes that workflow,
then delegates GitHub mutations to Release Please. The repository-local validator remains the
single structural package-validation implementation.

## Functional core

Release configuration is declarative. Release Please derives version changes from Conventional
Commit history; the workflow does not duplicate SemVer decisions in shell logic.

## Data model

`version.txt`, `.release-please-manifest.json`, and each plugin `version` field carry one SemVer
value. Release Please updates the three JSON fields through `$.version` extra-file entries.

## Test plan

Assert the release carriers, configuration, pre-1.0 bump policy, tag identity, workflow ordering and
permissions, stable marketplace identity, and user documentation. Run the complete Node suite,
package validation, whitespace checks, Claude validation, and a clean stable Codex installation.

## Risks

Release Please PRs created by `GITHUB_TOKEN` do not trigger other workflows. Review its head
manually before merging. Repository Actions settings must allow the token to create pull requests.
