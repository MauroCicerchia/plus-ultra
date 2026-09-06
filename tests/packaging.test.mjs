import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const validator = join(repoRoot, "scripts", "validate-packaging.mjs");

function writeJson(root, path, value) {
  const target = join(root, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "plus-ultra-packaging-"));
  mkdirSync(join(root, "skills"), { recursive: true });
  mkdirSync(join(root, "hooks"), { recursive: true });
  writeFileSync(join(root, "skills", "README.md"), "skills\n");
  writeFileSync(join(root, "hooks", "hooks.json"), "{}\n");
  writeFileSync(join(root, "hooks", "hooks-codex.json"), "{}\n");

  for (const path of [
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json",
    ".cursor-plugin/plugin.json",
  ]) {
    const fields = { name: "plus-ultra", version: "0.1.0", skills: "./skills/" };
    if (path === ".claude-plugin/plugin.json") {
      fields.hooks = "./hooks/hooks.json";
      fields.dependencies = ["superpowers"];
    }
    if (path === ".codex-plugin/plugin.json") fields.hooks = "./hooks/hooks-codex.json";
    writeJson(root, path, fields);
  }

  writeJson(root, ".claude-plugin/marketplace.json", {
    name: "plus-ultra",
    plugins: [{ name: "plus-ultra", source: "./" }],
  });
  writeJson(root, ".agents/plugins/marketplace.json", {
    name: "plus-ultra-dev",
    plugins: [{ name: "plus-ultra", source: { source: "url", url: "./" } }],
  });
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [validator, root], { encoding: "utf8" });
}

test("packaging validator accepts coherent plugin metadata", () => {
  const root = makeFixture();
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "Packaging validation passed.\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("packaging validator rejects invalid manifest JSON", () => {
  const root = makeFixture();
  try {
    writeFileSync(join(root, ".cursor-plugin", "plugin.json"), "{ invalid\n");
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\.cursor-plugin\/plugin\.json: invalid JSON/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("packaging validator rejects divergent versions and local suffixes", () => {
  const root = makeFixture();
  try {
    const codex = JSON.parse(readFileSync(join(root, ".codex-plugin/plugin.json"), "utf8"));
    codex.version = "0.1.1+codex.local-20260906-010203";
    writeJson(root, ".codex-plugin/plugin.json", codex);
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /versions must match/);
    assert.match(result.stderr, /must not use \+codex\.local-/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("packaging validator rejects missing, absolute, and escaping plugin paths", () => {
  const root = makeFixture();
  try {
    const claude = JSON.parse(readFileSync(join(root, ".claude-plugin/plugin.json"), "utf8"));
    const codex = JSON.parse(readFileSync(join(root, ".codex-plugin/plugin.json"), "utf8"));
    codex.skills = "/tmp/skills";
    claude.hooks = "../hooks/hooks.json";
    writeJson(root, ".claude-plugin/plugin.json", claude);
    writeJson(root, ".codex-plugin/plugin.json", codex);
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\.codex-plugin\/plugin\.json skills must be relative/);
    assert.match(result.stderr, /\.claude-plugin\/plugin\.json hooks must not escape the plugin root/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("packaging validator checks release version carriers when present", () => {
  const root = makeFixture();
  try {
    writeFileSync(join(root, "version.txt"), "0.1.1\n");
    writeJson(root, ".release-please-manifest.json", { ".": "0.1.2" });
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /version\.txt must match plugin manifests/);
    assert.match(result.stderr, /\.release-please-manifest\.json \"\.\" must match plugin manifests/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
