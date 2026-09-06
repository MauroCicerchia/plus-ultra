import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function readJson(path) {
  return JSON.parse(read(path));
}

test("release version carriers remain synchronized and preserve the 0.1.0 baseline", () => {
  const version = read("version.txt").trim();
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
  assert.deepEqual(readJson(".release-please-manifest.json"), { ".": version });
  for (const path of [
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json",
    ".cursor-plugin/plugin.json",
  ]) {
    assert.equal(readJson(path).version, version, path);
  }
  const changelog = read("CHANGELOG.md");
  assert.ok(changelog.includes(`## [${version}]`));
  assert.match(changelog, /## \[0\.1\.0\].*Initial development/is);
});

test("Release Please manages the root plugin as a simple v-prefixed component", () => {
  const config = readJson("release-please-config.json");
  assert.equal(config["bump-minor-pre-major"], true);
  assert.equal(config["bump-patch-for-minor-pre-major"], false);
  const plugin = config.packages["."];
  assert.deepEqual(
    {
      releaseType: plugin["release-type"],
      versionFile: plugin["version-file"],
      component: plugin.component,
      includeComponentInTag: plugin["include-component-in-tag"],
      includeVInTag: plugin["include-v-in-tag"],
    },
    {
      releaseType: "simple",
      versionFile: "version.txt",
      component: "plus-ultra",
      includeComponentInTag: false,
      includeVInTag: true,
    }
  );
  assert.deepEqual(
    plugin["extra-files"],
    [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json"].map(
      (path) => ({ type: "json", path, jsonpath: "$.version" })
    )
  );
});

test("release workflow validates main before invoking Release Please with write permissions", () => {
  const workflow = read(".github/workflows/release-please.yml");
  assert.match(workflow, /push:\n\s+branches:\n\s+- main/);
  assert.match(workflow, /validate:\n\s+uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.match(workflow, /release-please:\n\s+needs: validate/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /googleapis\/release-please-action@v4/);
  assert.match(workflow, /token: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.doesNotMatch(workflow, /release-type:/);
});

test("stable Codex marketplace identity and install/update instructions are documented", () => {
  const marketplace = readJson(".agents/plugins/marketplace.json");
  assert.equal(marketplace.name, "plus-ultra");
  assert.equal(marketplace.plugins[0].name, "plus-ultra");

  for (const path of ["README.md", "AGENTS.md"]) {
    const content = read(path);
    assert.match(content, /codex plugin marketplace add maurocicerchia\/plus-ultra --ref main/);
    assert.match(content, /codex plugin add plus-ultra@plus-ultra/);
    assert.match(content, /codex plugin marketplace upgrade plus-ultra/);
    assert.match(content, /claude plugin marketplace update plus-ultra/);
    assert.match(content, /claude plugin update plus-ultra@plus-ultra/);
    assert.match(content, /Cursor.*refresh|refresh.*Cursor/is);
  }
});
