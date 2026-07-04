---
title: <Short title>
status: draft # draft → approved → in-progress → done
created: <YYYY-MM-DD>
---

# NNN — <Title>

## Problem
<What is broken or missing, and why it matters now.>

## Goals / Non-goals
**Goals**
- <What this spec delivers.>

**Non-goals**
- <What this explicitly does not address.>

## Acceptance criteria
- [ ] <Observable, testable condition the implementation must satisfy.>
- [ ] <…>

## Interface contracts
<Public APIs, function signatures, CLI flags, HTTP routes, events. Include types.>

## Architecture boundaries
<Hexagonal boundaries for this change: domain/application modules, ports, adapters, and dependency
direction. Note where framework, database, network, filesystem, or UI details are isolated.>

## Functional core
<Pure functions, immutable data, explicit result/error types, injected dependencies, and side effects
that should stay behind ports. Explain any deliberate deviation.>

## Data model
<Schemas, types, migrations, persisted shapes.>

## Test plan
<What to test and at what level (unit / integration / e2e). Note fixtures and edge cases.
Tests must pass before commit — enforced by the plus-ultra commit-gate hook.>

## Risks
<What could go wrong, tricky edge cases, and the rollback story.>
