#!/usr/bin/env node
// A project-local, dependency-free verification wrapper. Copy this file to
// scripts/plus-ultra-verify.mjs; it intentionally has no plugin-relative imports.
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";

const CLEAN_LIMIT = 1024;
const WARNING_LIMIT = 8 * 1024;
const FAILURE_LIMIT = 16 * 1024;
const WARNING_LINES = 20;
const FAILURE_LINES = 80;
const SLUG = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) return null;
  return result.stdout;
}

function nullDelimited(buffer) {
  const paths = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue;
    if (index > start) paths.push(buffer.subarray(start, index));
    start = index + 1;
  }
  return paths;
}

function addHashPart(hash, label, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  hash.update(label);
  hash.update("\0");
  hash.update(String(bytes.length));
  hash.update("\0");
  hash.update(bytes);
}

function fileEntry(root, path) {
  const relativePath = path.toString("utf8");
  const absolutePath = resolve(root, relativePath);
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (absolutePath !== root && !absolutePath.startsWith(rootPrefix)) return null;

  let stat;
  try {
    stat = lstatSync(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return { type: "missing", mode: 0, value: Buffer.alloc(0) };
    }
    return null;
  }

  try {
    if (stat.isFile()) return { type: "file", mode: stat.mode & 0o7777, value: readFileSync(absolutePath) };
    if (stat.isSymbolicLink()) {
      return { type: "symlink", mode: stat.mode & 0o7777, value: readlinkSync(absolutePath, "buffer") };
    }
    return { type: "other", mode: stat.mode & 0o7777, value: Buffer.alloc(0) };
  } catch {
    return null;
  }
}

function addWorktreePaths(hash, root, label, paths) {
  for (const path of paths.sort(Buffer.compare)) {
    const entry = fileEntry(root, path);
    if (!entry) return false;
    addHashPart(hash, `${label}:path`, path);
    addHashPart(hash, `${label}:type`, entry.type);
    addHashPart(hash, `${label}:mode`, entry.mode);
    addHashPart(hash, `${label}:value`, entry.value);
  }
  return true;
}

// A null result is deliberately not treated as a clean verification baseline.
function workingTreeFingerprint(root) {
  try {
    const repository = git(root, ["rev-parse", "--show-toplevel"]);
    if (!repository) return null;
    const repositoryRoot = repository.toString("utf8").trim();
    if (!repositoryRoot) return null;

    const index = git(repositoryRoot, ["ls-files", "--stage", "-z"]);
    const tracked = git(repositoryRoot, ["ls-files", "-z"]);
    const untracked = git(repositoryRoot, ["ls-files", "--others", "--exclude-standard", "-z"]);
    if (!index || !tracked || !untracked) return null;

    const hash = createHash("sha256");
    addHashPart(hash, "plus-ultra-working-tree-fingerprint", "v1");
    addHashPart(hash, "index", index);
    if (!addWorktreePaths(hash, repositoryRoot, "tracked", nullDelimited(tracked))) return null;
    if (!addWorktreePaths(hash, repositoryRoot, "untracked", nullDelimited(untracked))) return null;
    return hash.digest("hex");
  } catch {
    return null;
  }
}

function runChild(command, args) {
  return new Promise((resolveRun) => {
    let child;
    try {
      child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      resolveRun({ stdout: "", stderr: "", error: String(error?.message ?? error), code: null, signal: null });
      return;
    }

    const stdout = [];
    const stderr = [];
    let error = null;
    child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.stdout?.on("error", (streamError) => { error ??= String(streamError?.message ?? streamError); });
    child.stderr?.on("error", (streamError) => { error ??= String(streamError?.message ?? streamError); });
    child.on("error", (spawnError) => { error ??= String(spawnError?.message ?? spawnError); });
    child.on("close", (code, signal) => {
      resolveRun({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        error,
        code,
        signal,
      });
    });
  });
}

function countMatches(text, expression) {
  return [...text.matchAll(expression)].length;
}

function diagnostics(text) {
  return {
    warningsDetected: countMatches(text, /\bwarning(?:s)?\b/gi),
    errorsDetected: countMatches(text, /\berror(?:s)?\b/gi),
  };
}

function truncateUtf8(text, maximum) {
  if (Buffer.byteLength(text, "utf8") <= maximum) return text;
  const suffix = "…";
  const suffixBytes = Buffer.byteLength(suffix, "utf8");
  let result = "";
  let bytes = 0;
  for (const character of text) {
    const next = Buffer.byteLength(character, "utf8");
    if (bytes + next + suffixBytes > maximum) break;
    result += character;
    bytes += next;
  }
  return result + suffix;
}

function excerpt(text, maxLines, maxBytes) {
  if (!text || maxLines <= 0 || maxBytes <= 0) return "";
  return truncateUtf8(text.split(/\r?\n/).slice(0, maxLines).join("\n"), maxBytes);
}

function outputFor(label, outcome, child, detected, receiptName, sourceState) {
  const source = child.error ? ` capture=${child.error}` : "";
  const sourceFingerprint = sourceState ? sourceState.slice(0, 12) : "unknown";
  const exit = child.signal ? ` signal=${child.signal}` : ` exit=${child.code ?? "unknown"}`;
  const summary = truncateUtf8(
    `${label}: ${outcome}${exit}; warnings detected=${detected.warningsDetected}; errors detected=${detected.errorsDetected}; source=${sourceFingerprint}; receipt=${receiptName}${source}`,
    CLEAN_LIMIT - 1
  );
  const combined = [child.stdout, child.stderr, child.error].filter(Boolean).join("\n");
  if (outcome === "passed") return `${summary}\n`;
  const limit = outcome === "warning" ? WARNING_LIMIT : FAILURE_LIMIT;
  const lines = outcome === "warning" ? WARNING_LINES : FAILURE_LINES;
  // Reserve a separator before and a terminal newline after the excerpt.
  const remaining = Math.max(0, limit - Buffer.byteLength(summary, "utf8") - 2);
  const detail = excerpt(combined, lines - 1, remaining);
  return `${summary}${detail ? `\n${detail}` : ""}\n`;
}

function receiptName() {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}-${randomBytes(4).toString("hex")}`;
}

function usage() {
  return "Usage: node scripts/plus-ultra-verify.mjs <label> -- <command> [args…]\n";
}

async function main() {
  const [label, separator, command, ...args] = process.argv.slice(2);
  if (!SLUG.test(label ?? "") || separator !== "--" || !command) {
    process.stderr.write(usage());
    process.exitCode = 2;
    return;
  }

  const root = process.cwd();
  const startedAt = new Date().toISOString();
  const started = process.hrtime.bigint();
  const before = workingTreeFingerprint(root);
  const child = await runChild(command, args);
  const after = workingTreeFingerprint(root);
  const detected = diagnostics(`${child.stdout}\n${child.stderr}`);
  const stable = Boolean(before && after && before === after);

  let outcome = "passed";
  if (!stable || child.error) outcome = "indeterminate";
  else if (child.code !== 0 || child.signal) outcome = "failed";
  else if (detected.warningsDetected > 0 || detected.errorsDetected > 0) outcome = "warning";

  const baseName = receiptName();
  const directory = resolve(root, ".context", "plus-ultra", "verification");
  const logName = outcome === "passed" ? null : `${baseName}.log`;
  const receiptFile = `${baseName}.json`;
  const fullOutput = [child.stdout, child.stderr, child.error].filter(Boolean).join("\n");
  const visibleOutput = outputFor(label, outcome, child, detected, receiptFile, after);
  const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  const receipt = {
    version: 1,
    label,
    argv: [command, ...args],
    startedAt,
    durationMs: Math.round(durationMs),
    outcome,
    verified: outcome === "passed" || outcome === "warning",
    process: { exitCode: child.code, signal: child.signal, captureError: child.error },
    diagnostics: detected,
    source: { before, after, stable },
    output: {
      stdoutBytes: Buffer.byteLength(child.stdout, "utf8"),
      stderrBytes: Buffer.byteLength(child.stderr, "utf8"),
      fullLogBytes: Buffer.byteLength(fullOutput, "utf8"),
      visible: visibleOutput.trimEnd(),
    },
    log: logName,
  };

  let persisted = true;
  try {
    mkdirSync(directory, { recursive: true });
    if (logName) writeFileSync(join(directory, logName), fullOutput);
    writeFileSync(join(directory, receiptFile), `${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    persisted = false;
    outcome = "indeterminate";
    receipt.outcome = outcome;
    receipt.verified = false;
    receipt.persistenceError = String(error?.message ?? error);
  }

  process.stdout.write(
    persisted ? visibleOutput : outputFor(label, outcome, child, detected, receiptFile, after)
  );
  process.exitCode = outcome === "passed" || outcome === "warning" ? 0 : 1;
}

await main();
