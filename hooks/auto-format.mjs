#!/usr/bin/env node
// PostToolUse (Write|Edit): auto-fix + format the edited file with Biome.
// Biome is one tool for lint-fix + format (replaces eslint + prettier), matching
// the plus-ultra:tech-stack default. Never blocks the edit — silently no-ops if
// Biome is absent or the file isn't a JS/TS source.
import { spawnSync } from "node:child_process";
import { readInput, debug } from "./_lib.mjs";

const input = await readInput();
debug("auto-format", input);

const file = String(input?.tool_input?.file_path ?? "");
if (!file) process.exit(0);

// Scope: JS/TS/JSON source files, anywhere in the repo (monorepo-friendly —
// apps/**, packages/**, src/**, config files at root all qualify).
if (!/\.(m?[jt]sx?|cts|mts|json|jsonc)$/.test(file)) process.exit(0);

try {
  // `biome check --write` runs safe lint fixes + formatting in one pass.
  // --no-errors-on-unmatched: don't fail if the file is outside Biome's config globs.
  spawnSync("npx", ["--no-install", "biome", "check", "--write", "--no-errors-on-unmatched", file], {
    stdio: "ignore",
    timeout: 25000,
  });
} catch {
  // ignore — Biome missing or errored; the edit stands as-is.
}

process.exit(0);
