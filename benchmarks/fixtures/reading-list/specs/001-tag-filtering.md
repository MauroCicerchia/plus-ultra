---
title: Filter reading-list entries by tag
status: approved
issue: 101
---

# Tag filtering

## Problem

Readers cannot organize or filter entries by tag without losing the CLI's existing local behavior.

## Goals / Non-goals

Add deterministic tag storage, formatting, and filtering. Do not add dependencies, remote services,
or persistence beyond the existing JSON file.

## Acceptance criteria

- `addEntry` still rejects an empty normalized title and allocates `max(existing ids) + 1`, including
  sparse lists.
- Tags are trimmed, lowercased, deduplicated, sorted, and stored when supplied without mutating the
  input array.
- `filterByTag(entries, tag)` compares normalized tags without mutating its input.
- `add <title> --tag <tag>...` accepts repeatable tag options and `list --tag <tag>` filters them.
- Formatted tagged entries append sorted tags as ` #tag`; untagged formatting is unchanged.
- Existing untagged `add`, `list`, and `read` behavior, validation, and data shape remain compatible.

## Interface contracts

Add optional `tags = []` to `addEntry`, export `filterByTag(entries, tag)`, accept repeatable
`--tag <tag>` on `add`, and accept at most one `--tag <tag>` on `list`.

## Architecture boundaries

Keep tag normalization and filtering in the library, presentation in the formatter, and filesystem
I/O plus argument parsing in the CLI.

## Functional core

Normalization, entry creation, filtering, and formatting remain deterministic and immutable.

## Data model

Tagged new entries may add `tags: string[]`; existing and newly added untagged entries remain valid
without a `tags` field.

## Test plan

Write the tag regression failing first. Cover sparse identifiers, empty titles, tag normalization,
deduplication, filtering immutability, sorted formatting, repeatable CLI flags, and the existing
untagged/read suite. Run the focused regression and complete suite.

## Risks

Argument parsing could consume title words as tag values, and adding an empty `tags` field could
break the existing persisted shape.
