#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mode = process.argv[2];

if (mode === "product") {
  const source = readFileSync("docs/product.md", "utf8");
  assert.equal(source.startsWith("# Product brief\n"), true);
  assert.equal(source.startsWith("---\n"), false);
  assert.deepEqual(source.match(/^## .+$/gm), [
    "## Target user",
    "## Core problem",
    "## Current alternative",
    "## Value proposition",
    "## MVP hypothesis",
    "## Core user journeys",
    "## Non-goals",
    "## Success criteria",
    "## Product principles and constraints",
  ]);
  assert.equal(
    source
      .split(/^## .+$/gm)
      .slice(1)
      .every((section) => section.trim().length > 0),
    true
  );
  process.stdout.write("product postcondition ok\n");
} else if (mode === "fast") {
  const { normalizeTitle } = await import("../src/format.mjs");
  assert.equal(normalizeTitle("  The\t Left\nHand  "), "The Left Hand");
  process.stdout.write("fast postcondition ok\n");
} else if (mode === "standard") {
  const { addEntry, filterByTag } = await import("../src/library.mjs");
  const entries = addEntry([], "  Dune ", ["Sci-Fi", " fiction ", "sci-fi"]);
  assert.deepEqual(entries, [
    { id: 1, title: "Dune", read: false, tags: ["fiction", "sci-fi"] },
  ]);
  assert.deepEqual(filterByTag(entries, "SCI-FI"), entries);

  const directory = mkdtempSync(join(tmpdir(), "reading-list-check-"));
  try {
    const dataPath = join(directory, "entries.json");
    const environment = { ...process.env, READING_LIST_FILE: dataPath };
    const add = spawnSync(
      process.execPath,
      ["src/cli.mjs", "add", "Dune", "--tag", "sci-fi", "--tag", "classic"],
      { cwd: process.cwd(), encoding: "utf8", env: environment }
    );
    assert.equal(add.status, 0, add.stderr);
    const list = spawnSync(
      process.execPath,
      ["src/cli.mjs", "list", "--tag", "SCI-FI"],
      { cwd: process.cwd(), encoding: "utf8", env: environment }
    );
    assert.equal(list.status, 0, list.stderr);
    assert.equal(list.stdout, "[ ] 1 Dune #classic #sci-fi\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  process.stdout.write("standard postcondition ok\n");
} else if (mode === "review-first" || mode === "review-rereview") {
  const statePath = process.env.PLUS_ULTRA_BENCHMARK_GH_STATE;
  assert.ok(statePath, "fake GitHub state path is required");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (mode === "review-first") {
    const review = state.mutations.find(({ operation }) => operation === "create_inline_comment");
    const summary = state.mutations.find(
      ({ operation }) => operation === "create_review_summary"
    );
    assert.equal(review.head_oid, state.heads.blocked.oid);
    assert.equal(review.path, state.heads.blocked.known_blocker.path);
    assert.equal(review.line, state.heads.blocked.known_blocker.line);
    assert.equal(review.side, "RIGHT");
    assert.match(review.body, /^<!-- plus-ultra:pr-review:inline -->/);
    assert.match(review.body, /missing-title-validation/);
    assert.match(summary.body, /^<!-- plus-ultra:pr-review:summary -->/);
    assert.match(summary.body, /⛔ Changes required — one or more blockers\./);
    process.stdout.write("first review postcondition ok\n");
  } else {
    const summary = state.mutations.find(({ operation }) => operation === "update_review_summary");
    const resolution = state.mutations.find(
      ({ operation }) => operation === "resolve_review_thread"
    );
    assert.equal(summary.head_oid, state.heads.corrected.oid);
    assert.match(summary.body, /^<!-- plus-ultra:pr-review:summary -->/);
    assert.equal(summary.body.split("\n").includes(state.expected_resolution.marker), true);
    assert.deepEqual(summary.resolutions, [
      { finding: state.expected_resolution.finding, status: "resolved" },
    ]);
    assert.equal(resolution.thread_id, state.prior_review.thread.id);
    assert.equal(state.prior_review.thread.isResolved, true);
    process.stdout.write("re-review postcondition ok\n");
  }
} else {
  process.stderr.write("unknown postcondition\n");
  process.exitCode = 64;
}
