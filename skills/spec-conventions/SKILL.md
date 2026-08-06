---
name: spec-conventions
description: Use when creating, organizing, tracking, or resuming specs; when Superpowers brainstorming or writing-plans needs project artifact locations; or when deciding whether workflow artifacts belong in version control.
---

# plus-ultra spec conventions

Superpowers owns the *methodology* (brainstorming → writing-plans → subagent TDD → verification).
This skill owns the *repo conventions* for where that work lives and how its state is tracked.

## Working artifacts stay local

Override Superpowers' default artifact paths so intermediate process documents do not become
repository documentation:

- Store transient brainstorming output and implementation plans under `.context/superpowers/`.
- Ensure `.gitignore` contains `/.context/` and `/docs/superpowers/` before brainstorming or planning.
- Do not commit `.context/`; it is local agent workspace state.
- Do not commit `docs/superpowers/`; ignore it as a compatibility path for tools using defaults.
- For trivial changes, skip standalone design and implementation-plan artifacts.
- For approved work, use `specs/NNN-slug.md` and commit it as the durable specification.
- Keep durable project documentation under `docs/` and commit it only when it remains useful after
  the implementation session.

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

- Use Superpowers **brainstorming** to shape the idea, then **writing-plans** to plan implementation.
- Keep intermediate outputs under `.context/superpowers/`; do not duplicate them under `docs/`.
- When a durable spec is warranted, shape `specs/NNN-slug.md` with `status: draft` using the
  template while keeping intermediate process documents under `.context/superpowers/`.
- Once agreed, flip the spec to `approved` and commit it; use `in-progress` during implementation
  and `done` after verification.
- On a fresh session, the plus-ultra SessionStart hook reports which spec is `in-progress` so you
  resume without re-explaining context.
