---
name: new-project
description: Scaffold a new project with the plus-ultra default stack — a pnpm-workspaces monorepo with a React + Vite web app, a Hono API, a shared zod/types package, Biome, vitest, and CI. Use when starting a new repo, bootstrapping an app, or asked to "set up a project" without a stack specified. Reads plus-ultra:tech-stack for the picks.
---

# plus-ultra new project scaffold

Bootstraps the `plus-ultra:tech-stack` defaults. Confirm the stack with the user first if they
haven't stated one — this skill fills silence, it doesn't override stated preferences.

## Before scaffolding

- Confirm project name and whether they want the full **monorepo** (default) or a **single package**
  (throwaway / single-surface). Everything below assumes the monorepo.
- Fetch current setup commands/versions via Context7 before running init commands — don't rely on
  memorized CLI flags for Vite, Hono, Drizzle, Biome, etc.

## Target layout

```
.
├── package.json            # workspace root: scripts, devDeps (biome, typescript, vitest)
├── pnpm-workspace.yaml      # packages: apps/*, packages/*
├── biome.json               # one config for lint + format
├── tsconfig.base.json       # strict base extended by each workspace
├── .github/workflows/ci.yml # from this skill's assets/ci.yml
├── apps/
│   ├── web/                 # React + Vite + React Router + Tailwind + shadcn/ui
│   └── api/                 # Hono server + Drizzle (Neon Postgres)
└── packages/
    └── shared/              # zod schemas + types imported by BOTH apps
```

## Steps

1. **Root workspace** — `package.json` (private, `packageManager: pnpm@…`), `pnpm-workspace.yaml`
   listing `apps/*` and `packages/*`. Root scripts delegate with `pnpm -r`:
   `typecheck` (`tsc --noEmit` per workspace), `test` (`vitest run`), `lint`/`format` (Biome).
2. **`tsconfig.base.json`** — `strict: true`, `moduleResolution: bundler`, `noUncheckedIndexedAccess`.
   Each workspace extends it.
3. **`packages/shared`** — export zod schemas + inferred types. This is the front↔back contract.
4. **`apps/api`** — Hono app; validate request bodies with the shared zod schemas; **export the app
   type** for RPC. Drizzle schema + `@neondatabase/serverless` connection.
5. **`apps/web`** — Vite + React + React Router; Tailwind + shadcn/ui; typed API calls via Hono's
   `hc<AppType>` client. Apply the `frontend-design` skill for the visual layer.
6. **Biome** — `biome.json` at root; wire the plus-ultra `auto-format` hook's tool (it runs
   `biome check --write` on edited files).
7. **CI** — copy [`assets/ci.yml`](./assets/ci.yml) to `.github/workflows/ci.yml` (install → Biome
   ci → typecheck → test).
8. **Repo conventions** — create `specs/` and `docs/` per `plus-ultra:spec-conventions`; add a
   `.gitignore` covering `node_modules`, `dist`, `.env*` (keep `.env.example`).

## After scaffolding

- Verify: `pnpm install`, then `pnpm -r typecheck` and `pnpm -r test` exit 0 (also satisfies the
  commit-gate before the first commit).
- First commit uses `plus-ultra:conventional-commits` (e.g. `chore: scaffold monorepo`).
