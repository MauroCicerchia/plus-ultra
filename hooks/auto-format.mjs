#!/usr/bin/env node
// PostToolUse (Write|Edit): auto-fix + format the edited file with Biome.
// Biome is one tool for lint-fix + format (replaces eslint + prettier), matching
// the plus-ultra:tech-stack default. Never blocks the edit — silently no-ops if
// Biome is absent or the file isn't a JS/TS source.
import { spawnSync } from "node:child_process";
import { readInput, debug } from "./_lib.mjs";

const input = await readInput();
debug("auto-format", input);

function patchFiles(patch) {
  const files = [];
  for (const line of String(patch ?? "").split("\n")) {
    const match = line.match(/^\*\*\* (?:Add|Update) File: (.+)$/);
    if (match) files.push(match[1].trim());
  }
  return files;
}

function targetFiles(payload) {
  const toolInput = payload?.tool_input;
  const files = [];

  if (toolInput?.file_path) files.push(String(toolInput.file_path));

  if (payload?.tool_name === "apply_patch") {
    if (typeof toolInput === "string") files.push(...patchFiles(toolInput));
    if (typeof toolInput?.patch === "string") files.push(...patchFiles(toolInput.patch));
  }

  return [...new Set(files)];
}

// Scope: JS/TS/JSON source files, anywhere in the repo (monorepo-friendly —
// apps/**, packages/**, src/**, config files at root all qualify).
const files = targetFiles(input).filter((file) => /\.(m?[jt]sx?|cts|mts|json|jsonc)$/.test(file));
if (files.length === 0) process.exit(0);

for (const file of files) {
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
}

process.exit(0);
