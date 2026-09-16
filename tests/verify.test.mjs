import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const wrapper = join(repoRoot, "skills", "verification", "assets", "plus-ultra-verify.mjs");

function run(command, args, cwd, options = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
  });
}

function makeProject() {
  const root = mkdtempSync(join(tmpdir(), "plus-ultra-verify-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "app.mjs"), "export const value = 1;\n");
  assert.equal(run("git", ["init", "--initial-branch=main"], root).status, 0);
  assert.equal(run("git", ["config", "user.email", "verify@example.com"], root).status, 0);
  assert.equal(run("git", ["config", "user.name", "Verify tests"], root).status, 0);
  assert.equal(run("git", ["add", "."], root).status, 0);
  assert.equal(run("git", ["commit", "-m", "Initial commit"], root).status, 0);
  return root;
}

function verify(cwd, label, command = [process.execPath, "-e", ""], options) {
  return run(process.execPath, [wrapper, label, "--", ...command], cwd, options);
}

function receipts(root) {
  const dir = join(root, ".context", "plus-ultra", "verification");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".json"));
}

function receipt(root) {
  const names = receipts(root);
  assert.equal(names.length, 1);
  return JSON.parse(readFileSync(join(root, ".context", "plus-ultra", "verification", names[0]), "utf8"));
}

function visibleLineCount(text) {
  return text.trimEnd().split("\n").length;
}

test("clean successful verification prints a bounded summary and writes a stable receipt", () => {
  const cwd = makeProject();
  try {
    const result = verify(cwd, "test");
    assert.equal(result.status, 0, result.stderr);
    assert.ok(Buffer.byteLength(result.stdout, "utf8") <= 1024);
    assert.match(result.stdout, /test: passed/);
    assert.match(result.stdout, /source=[a-f0-9]{12}/);

    const record = receipt(cwd);
    assert.deepEqual(record.argv, [process.execPath, "-e", ""]);
    assert.equal(record.outcome, "passed");
    assert.equal(record.source.stable, true);
    assert.equal(typeof record.source.before, "string");
    assert.equal(record.source.before, record.source.after);
    assert.equal(record.log, null);
    assert.match(record.output.visible, /test: passed/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("warning verification retains the full log while bounding visible diagnostics", () => {
  const cwd = makeProject();
  try {
    const command = [
      process.execPath,
      "-e",
      "process.stdout.write(Array.from({ length: 40 }, (_, i) => `warning ${i} ${'x'.repeat(600)}\\n`).join(''))",
    ];
    const result = verify(cwd, "lint", command);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /lint: warning/);
    assert.ok(Buffer.byteLength(result.stdout, "utf8") <= 8 * 1024);
    assert.ok(visibleLineCount(result.stdout) <= 20);

    const record = receipt(cwd);
    assert.equal(record.outcome, "warning");
    assert.equal(record.verified, true);
    assert.equal(record.diagnostics.warningsDetected, 40);
    assert.ok(Buffer.byteLength(record.output.visible, "utf8") <= 8 * 1024);
    assert.equal(typeof record.log, "string");
    const rawLog = readFileSync(join(cwd, ".context", "plus-ultra", "verification", record.log), "utf8");
    assert.ok(Buffer.byteLength(rawLog, "utf8") > 8 * 1024);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("failed verification returns nonzero, preserves full output, and bounds the visible excerpt", () => {
  const cwd = makeProject();
  try {
    const command = [
      process.execPath,
      "-e",
      "process.stderr.write(Array.from({ length: 100 }, (_, i) => `error ${i} ${'x'.repeat(400)}\\n`).join('')); process.exit(3)",
    ];
    const result = verify(cwd, "build", command);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /build: failed/);
    assert.ok(Buffer.byteLength(result.stdout, "utf8") <= 16 * 1024);
    assert.ok(visibleLineCount(result.stdout) <= 80);

    const record = receipt(cwd);
    assert.equal(record.outcome, "failed");
    assert.equal(record.verified, false);
    assert.equal(record.process.exitCode, 3);
    assert.equal(record.diagnostics.errorsDetected, 100);
    assert.ok(readFileSync(join(cwd, ".context", "plus-ultra", "verification", record.log), "utf8").includes("error 99"));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("a source change during an otherwise successful command is indeterminate", () => {
  const cwd = makeProject();
  try {
    const result = verify(cwd, "test", [
      process.execPath,
      "-e",
      "require('node:fs').writeFileSync('changed.mjs', 'export const changed = true;\\n')",
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /test: indeterminate/);

    const record = receipt(cwd);
    assert.equal(record.outcome, "indeterminate");
    assert.equal(record.verified, false);
    assert.equal(record.source.stable, false);
    assert.notEqual(record.source.before, record.source.after);
    assert.equal(typeof record.log, "string");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("missing Git and a capture error both fail closed as indeterminate", () => {
  const withoutGit = mkdtempSync(join(tmpdir(), "plus-ultra-verify-no-git-"));
  const gitlessBin = join(withoutGit, "bin");
  mkdirSync(gitlessBin);
  try {
    const noGit = verify(withoutGit, "test", [process.execPath, "-e", ""], { PATH: gitlessBin });
    assert.equal(noGit.status, 1);
    const noGitReceipt = receipt(withoutGit);
    assert.equal(noGitReceipt.outcome, "indeterminate");
    assert.equal(noGitReceipt.source.before, null);
    assert.equal(noGitReceipt.source.after, null);

    const cwd = makeProject();
    try {
      const captureError = verify(cwd, "test", ["does-not-exist-plus-ultra-verify"]);
      assert.equal(captureError.status, 1);
      const captureReceipt = receipt(cwd);
      assert.equal(captureReceipt.outcome, "indeterminate");
      assert.equal(captureReceipt.verified, false);
      assert.equal(typeof captureReceipt.process.captureError, "string");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  } finally {
    rmSync(withoutGit, { recursive: true, force: true });
  }
});

test("an interrupted child is a failed verification with a retained log", () => {
  const cwd = makeProject();
  try {
    const result = verify(cwd, "test", [
      process.execPath,
      "-e",
      "process.stdout.write('about to stop\\n'); process.kill(process.pid, 'SIGTERM')",
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /test: failed/);
    const record = receipt(cwd);
    assert.equal(record.outcome, "failed");
    assert.equal(record.process.signal, "SIGTERM");
    assert.equal(readFileSync(join(cwd, ".context", "plus-ultra", "verification", record.log), "utf8"), "about to stop\n");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("rejects invalid labels and malformed command separators before executing", () => {
  const cwd = makeProject();
  try {
    for (const args of [[], ["Test", "--", process.execPath, "-e", ""], ["test", process.execPath, "-e", ""]]) {
      const result = run(process.execPath, [wrapper, ...args], cwd);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /Usage:/);
    }
    assert.equal(receipts(cwd).length, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
