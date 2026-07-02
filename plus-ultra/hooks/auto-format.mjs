#!/usr/bin/env node
// PostToolUse (Write|Edit): auto-fix + format edited source files.
// Runs eslint --fix then prettier --write on JS/TS files under src/.
// Never blocks the edit — silently no-ops if tooling is absent or file is out of scope.
import { spawnSync } from "node:child_process";
import { readInput, debug } from "./_lib.mjs";

const input = await readInput();
debug("auto-format", input);

const file = String(input?.tool_input?.file_path ?? "");
if (!file) process.exit(0);

// Scope: files under a src/ directory with a JS/TS extension.
if (!/(^|\/)src\//.test(file)) process.exit(0);
if (!/\.(m?[jt]sx?|cts|mts)$/.test(file)) process.exit(0);

const run = (bin, args) => {
  try {
    spawnSync("npx", ["--no-install", bin, ...args, file], {
      stdio: "ignore",
      timeout: 25000,
    });
  } catch {
    // ignore — tooling missing or errored; the edit stands as-is.
  }
};

run("eslint", ["--fix"]);
run("prettier", ["--write"]);

process.exit(0);
