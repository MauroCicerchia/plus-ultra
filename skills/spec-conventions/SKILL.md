---
name: spec-conventions
description: Repo conventions for spec-driven development in this project — how to name, structure, and track spec documents under specs/, plus where architecture notes, ADRs, and the changelog live in docs/. Use when creating a new spec, organizing spec files, updating a spec's status, or resuming work and needing to know the project's spec layout. Complements Superpowers' brainstorming and writing-plans skills, which produce the spec content itself.
---

# plus-ultra spec conventions

Superpowers owns the *methodology* (brainstorming → writing-plans → subagent TDD → verification).
This skill owns the *repo conventions* for where that work lives and how its state is tracked.

## Specs live in `specs/`

One file per spec: `specs/NNN-slug.md`

- `NNN` — zero-padded 3-digit sequence, incrementing (`001`, `002`, …). Never reuse a number.
- `slug` — short kebab-case description (`002-user-auth`, `013-rate-limiter`).
- To find the next number: take the highest existing `NNN` in `specs/` and add one.

Each spec carries YAML frontmatter with a `status:` field driving the lifecycle:

```
draft → approved → in-progress → done
```

- **draft** — being written / under discussion. Not ready to build.
- **approved** — agreed; ready to pick up.
- **in-progress** — actively being implemented (the SessionStart hook surfaces this on resume).
- **done** — shipped and verified.

Exactly one spec should normally be `in-progress` at a time (solo, one thread of work).

## Spec template

New specs start from [`template.md`](./template.md). Required sections:

1. **Problem** — what's broken/missing and why it matters.
2. **Goals / Non-goals** — what this does and explicitly does not address.
3. **Acceptance criteria** — checklist the implementation must satisfy. The `plus-ultra:code-reviewer`
   subagent diffs the branch against these.
4. **Interface contracts** — public APIs, function signatures, CLI flags, HTTP routes, events.
5. **Architecture boundaries** — domain/application modules, ports, adapters, and dependency
   direction for changes where hexagonal architecture is applicable.
6. **Functional core** — pure functions, immutable data, explicit result/error types, injected
   dependencies, side-effect boundaries, and any justified deviation.
7. **Data model** — schemas, types, migrations, persisted shapes.
8. **Test plan** — what to test and at what level (unit/integration/e2e). Tests must pass before
   commit (enforced by the `commit-gate` hook).
9. **Risks** — what could go wrong, edge cases, rollback story.

## Docs live in `docs/`

- `docs/architecture.md` — system overview, module boundaries, key decisions in prose.
- `docs/adr/NNN-slug.md` — Architecture Decision Records (one per significant decision, same
  numbering style). Start each from [`adr-template.md`](./adr-template.md): Context → Decision →
  Alternatives considered → Consequences, with a `status:` of proposed → accepted → superseded.
- `docs/CHANGELOG.md` — user-facing change log, newest first.

## Workflow fit

- Use Superpowers **brainstorming** to shape the idea, then **writing-plans** to produce the spec body.
- Save the result as `specs/NNN-slug.md` with `status: draft`, following the template.
- Flip to `approved` once agreed, `in-progress` when implementation starts, `done` when verified.
- On a fresh session, the plus-ultra SessionStart hook reports which spec is `in-progress` so you
  resume without re-explaining context.
