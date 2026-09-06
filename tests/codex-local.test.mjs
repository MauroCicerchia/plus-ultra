import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const command = join(repoRoot, "scripts", "codex-local.mjs");

function writeJson(root, path, value) {
  const target = join(root, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "ignore" });
}

function makeSource() {
  const root = join(tmpdir(), `plus-ultra-codex-local-${process.pid}-${Math.random()}`);
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, "skills"), { recursive: true });
  mkdirSync(join(root, "hooks"), { recursive: true });
  writeFileSync(join(root, "skills", "README.md"), "skills\n");
  writeFileSync(join(root, "hooks", "hooks.json"), "{}\n");
  writeFileSync(join(root, "hooks", "hooks-codex.json"), "{}\n");
  writeFileSync(join(root, ".gitignore"), ".env\n.context/\n");
  writeFileSync(join(root, ".env"), "SECRET=do-not-copy\n");
  writeFileSync(join(root, "untracked.md"), "copy me\n");
  mkdirSync(join(root, ".context"), { recursive: true });
  writeFileSync(join(root, ".context", "private.txt"), "do-not-copy\n");

  for (const path of [
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json",
    ".cursor-plugin/plugin.json",
  ]) {
    const manifest = { name: "plus-ultra", version: "0.1.0", skills: "./skills/" };
    if (path === ".claude-plugin/plugin.json") {
      manifest.hooks = "./hooks/hooks.json";
      manifest.dependencies = ["superpowers"];
    }
    if (path === ".codex-plugin/plugin.json") manifest.hooks = "./hooks/hooks-codex.json";
    writeJson(root, path, manifest);
  }
  writeJson(root, ".claude-plugin/marketplace.json", {
    name: "plus-ultra",
    plugins: [{ name: "plus-ultra", source: "./" }],
  });
  writeJson(root, ".agents/plugins/marketplace.json", {
    name: "plus-ultra",
    plugins: [{ name: "plus-ultra", source: { source: "url", url: "./" } }],
  });
  writeFileSync(join(root, "version.txt"), "0.1.0\n");
  writeJson(root, ".release-please-manifest.json", { ".": "0.1.0" });

  run("git", ["init", "--initial-branch=main"], root);
  run("git", ["config", "user.email", "test@example.com"], root);
  run("git", ["config", "user.name", "Codex local tests"], root);
  run("git", ["add", "."], root);
  run("git", ["commit", "-m", "feat: source fixture"], root);
  return root;
}

function makeFakeCodex(root) {
  const bin = join(root, "bin");
  const log = join(root, "codex-commands.jsonl");
  mkdirSync(bin, { recursive: true });
  const script = `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify(args) + "\\n");
if (args.join(" ") === "plugin marketplace list --json") {
  process.stdout.write(process.env.FAKE_MARKETPLACES ?? '{"marketplaces":[]}');
}
`;
  writeFileSync(join(bin, "codex"), script);
  chmodSync(join(bin, "codex"), 0o755);
  return { binary: join(bin, "codex"), log };
}

function runLocal(root, fake, action, options = {}) {
  const result = spawnSync(process.execPath, [command, action], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_BIN: fake.binary,
      FAKE_CODEX_LOG: fake.log,
      PLUS_ULTRA_CODEX_LOCAL_TIMESTAMP: "20260906-010203",
      ...options.env,
    },
  });
  return result;
}

function commandLog(path) {
  return existsSync(path)
    ? readFileSync(path, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
}

test("refresh stages only Git-included source files with a unique local version", () => {
  const root = makeSource();
  const fake = makeFakeCodex(root);
  try {
    assert.equal(runLocal(root, fake, "refresh").status, 0);
    const stage = join(root, ".context", "codex-dev-marketplace");
    assert.equal(existsSync(join(stage, "plugins", "plus-ultra", ".git")), true);
    assert.equal(readFileSync(join(stage, "plugins", "plus-ultra", "untracked.md"), "utf8"), "copy me\n");
    assert.equal(existsSync(join(stage, "plugins", "plus-ultra", ".env")), false);
    assert.equal(existsSync(join(stage, "plugins", "plus-ultra", ".context")), false);
    for (const path of [
      ".claude-plugin/plugin.json",
      ".codex-plugin/plugin.json",
      ".cursor-plugin/plugin.json",
    ]) {
      assert.match(
        JSON.parse(readFileSync(join(stage, "plugins", "plus-ultra", path), "utf8")).version,
        /^0\.1\.0\+codex\.local-20260906-010203$/
      );
      assert.equal(JSON.parse(readFileSync(join(root, path), "utf8")).version, "0.1.0");
    }
    assert.equal(
      JSON.parse(readFileSync(join(stage, ".agents", "plugins", "marketplace.json"), "utf8")).name,
      "plus-ultra-dev"
    );
    assert.deepEqual(commandLog(fake.log).slice(-3), [
      ["plugin", "remove", "plus-ultra@plus-ultra"],
      ["plugin", "marketplace", "add", realpathSync(stage)],
      ["plugin", "add", "plus-ultra@plus-ultra-dev"],
    ]);

    assert.equal(runLocal(root, fake, "refresh").status, 0);
    const nextVersion = JSON.parse(
      readFileSync(join(stage, "plugins", "plus-ultra", ".codex-plugin", "plugin.json"), "utf8")
    ).version;
    assert.equal(nextVersion, "0.1.0+codex.local-20260906-010204");
    run("git", ["diff", "--exit-code"], root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refresh aborts before replacing a foreign development marketplace", () => {
  const root = makeSource();
  const fake = makeFakeCodex(root);
  try {
    const result = runLocal(root, fake, "refresh", {
      env: {
        FAKE_MARKETPLACES: JSON.stringify({
          marketplaces: [{ name: "plus-ultra-dev", root: "/another/plugin/root" }],
        }),
      },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /plus-ultra-dev.*another plugin root/i);
    assert.equal(existsSync(join(root, ".context", "codex-dev-marketplace")), false);
    assert.deepEqual(commandLog(fake.log), [["plugin", "marketplace", "list", "--json"]]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("restore removes only managed development state and reinstalls the stable plugin", () => {
  const root = makeSource();
  const fake = makeFakeCodex(root);
  try {
    assert.equal(runLocal(root, fake, "refresh").status, 0);
    const stage = join(root, ".context", "codex-dev-marketplace");
    writeFileSync(fake.log, "");
    const result = runLocal(root, fake, "restore", {
      env: {
        FAKE_MARKETPLACES: JSON.stringify({
          marketplaces: [{ name: "plus-ultra-dev", root: stage }],
        }),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(stage), false);
    assert.deepEqual(commandLog(fake.log), [
      ["plugin", "marketplace", "list", "--json"],
      ["plugin", "remove", "plus-ultra@plus-ultra-dev"],
      ["plugin", "marketplace", "remove", "plus-ultra-dev"],
      ["plugin", "marketplace", "add", "maurocicerchia/plus-ultra", "--ref", "main"],
      ["plugin", "add", "plus-ultra@plus-ultra"],
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
