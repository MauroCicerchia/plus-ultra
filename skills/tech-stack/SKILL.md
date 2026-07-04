---
name: tech-stack
description: The default technology stack for new projects in this harness — a TypeScript-everywhere React + Hono monorepo. Use when starting a new project, scaffolding an app, choosing a framework/library/tool, or when a decision needs a sensible default. States the picks and, for each, when to deviate. Superpowers owns the methodology; this skill owns the defaults.
---

# plus-ultra default tech stack

Opinionated defaults so a new project starts without re-litigating tooling. **TypeScript on both
ends, React on the front, Hono on the back, one monorepo, types shared across the boundary.**

These are defaults, not laws. Each row says when to deviate. If the user names a different tool,
follow the user — this skill only fills silence.

## The stack

| Layer | Default | Deviate when |
|---|---|---|
| Repo | **pnpm workspaces monorepo** | truly single-surface throwaway → single package |
| Language | **TypeScript, `strict: true`**, both ends | never (this harness is TS-first) |
| Frontend build | **Vite** | — |
| UI framework | **React** | — |
| Routing | **React Router** | app is a single view |
| Styling | **Tailwind CSS** | design system mandates otherwise |
| Components | **shadcn/ui** | need a heavier component lib (MUI, etc.) |
| Design guidance | **`frontend-design` skill** | — |
| Backend framework | **Hono** | need Fastify's plugin ecosystem / pure-Node middleware |
| Front↔back types | **Hono RPC** (`hc` client) | GraphQL surface → codegen instead |
| Validation | **zod**, schemas in `packages/shared` | — |
| Database | **Neon Postgres** | local-only / embedded → SQLite |
| ORM / query | **Drizzle** | raw SQL is genuinely simpler |
| Tests | **vitest** | — |
| Lint + format | **Biome** (one tool, replaces eslint + prettier) | a required plugin only exists for eslint |
| Package manager | **pnpm** | — |
| Deploy | **Vercel** (web) + **Fly/Railway** (api) | — |

## Monorepo layout

```
apps/web           React + Vite + React Router + Tailwind + shadcn/ui
apps/api           Hono server
packages/shared    zod schemas + types imported by BOTH apps
```

The point of TypeScript-on-both-ends is the shared boundary: **define a shape once as a zod schema
in `packages/shared`**, and both the API (validate input) and the web app (typed fetch via Hono RPC)
consume it. No duplicated types, no drift. If you find yourself writing the same interface twice,
move it to `packages/shared`.

## How it connects

- **Hono RPC** — export the Hono app's type from `apps/api`, import it in `apps/web` with `hc<AppType>`.
  The frontend gets fully-typed routes and payloads with zero codegen.
- **zod** — every API boundary (request body, params, response) is a zod schema in `packages/shared`.
  Hono validates with it server-side; the web app infers types from it client-side.
- **Drizzle + Neon** — Drizzle schema lives in `apps/api`; use `@neondatabase/serverless` for the
  connection so it works on serverless/edge runtimes.

## Companion capabilities

These are recommended helpers, not plus-ultra dependencies. Use them when available; if they are
missing, continue with official docs and CLI commands.

- **`frontend-design`** — apply when creating or reshaping the web app's visual layer.
- **`shadcn` / shadcn MCP** — use for component docs, registry lookup, examples, and safe component
  installation.
- **`gh-cli`** — use with the `gh` CLI for GitHub issues, PRs, Actions, releases, and repository
  operations.
- **Neon skills / MCPs** — use for Neon project setup, database URLs, branching, and connection
  guidance.

## Fit with the rest of plus-ultra

- `plus-ultra:new-project` scaffolds this layout.
- The `auto-format` hook runs **Biome** on edited files — matches this stack's lint/format pick.
- The `commit-gate` hook requires a passing **vitest** run (and a `tsc` typecheck in TS projects)
  before commit.
- `plus-ultra:spec-conventions` governs where specs and ADRs live.
