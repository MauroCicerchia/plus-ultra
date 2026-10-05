// Shared helpers for plus-ultra hooks. Zero dependencies.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve, sep } from "node:path";

// Read and parse the hook JSON payload from stdin. Returns {} on empty/invalid.
export async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Optional debugging: PLUS_ULTRA_HOOK_DEBUG=1 dumps the raw payload to stderr.
export function debug(label, input) {
  if (process.env.PLUS_ULTRA_HOOK_DEBUG) {
    process.stderr.write(`[plus-ultra:${label}] ${JSON.stringify(input)}\n`);
  }
}

// Deny a PreToolUse tool call. Emits the structured JSON decision and exits 0
// (exit 2 also blocks, but the JSON form carries a reason to the model/user).
export function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
}

// Allow: no decision, normal permission flow applies.
export function allow() {
  process.exit(0);
}

export function isCodexInput(input) {
  return Boolean(input?.hook_event_name || process.env.PLUGIN_ROOT);
}

export function projectRoot(input) {
  return process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
}

// Per-session state dir under the project, created lazily.
export function stateDir(input) {
  const root = projectRoot(input);
  const dir = isCodexInput(input) ? ".codex" : ".claude";
  return `${root}/${dir}/plus-ultra/state`;
}

// Per-session marker file (records testPassedAt / typecheckPassedAt).
export function markerPath(sessionId, input) {
  return `${stateDir(input)}/${String(sessionId || "default")}.json`;
}

// Read the session marker as an object, or {} if absent/invalid.
export function readMarker(sessionId, input) {
  try {
    return JSON.parse(readFileSync(markerPath(sessionId, input), "utf8"));
  } catch {
    return {};
  }
}

// Merge fields into the session marker. Never throws.
export function mergeMarker(sessionId, patch, input) {
  try {
    mkdirSync(stateDir(input), { recursive: true });
    writeFileSync(
      markerPath(sessionId, input),
      JSON.stringify({ ...readMarker(sessionId, input), ...patch }, null, 2)
    );
  } catch {
    // never disrupt the session over a marker write failure
  }
}

// Does this project use TypeScript? True if a tsconfig.json exists at the root
// or in any immediate apps/* or packages/* workspace (monorepo layout).
export function isTsProject(root) {
  const base = typeof root === "object" ? projectRoot(root) : root || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (existsSync(`${base}/tsconfig.json`)) return true;
  for (const dir of ["apps", "packages"]) {
    try {
      for (const entry of readdirSync(`${base}/${dir}`, { withFileTypes: true })) {
        if (entry.isDirectory() && existsSync(`${base}/${dir}/${entry.name}/tsconfig.json`)) return true;
      }
    } catch {
      // dir absent — ignore
    }
  }
  return false;
}

function git(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) return null;
  return result.stdout;
}

export function nullDelimited(buffer) {
  const values = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue;
    if (index === start) return null;
    values.push(buffer.subarray(start, index));
    start = index + 1;
  }
  if (start !== buffer.length) return null;
  return values;
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
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return { type: "missing", mode: 0, value: Buffer.alloc(0) };
    return null;
  }

  try {
    if (stat.isFile()) return { type: "file", mode: stat.mode & 0o7777, value: readFileSync(absolutePath) };
    if (stat.isSymbolicLink()) {
      return { type: "symlink", mode: stat.mode & 0o7777, value: readlinkSync(absolutePath, "buffer") };
    }
    if (stat.isDirectory()) {
      // A tracked directory is a Git submodule. Its checked-out commit is part
      // of the verification input even when the gitlink has not been staged.
      const topLevel = git(absolutePath, ["rev-parse", "--show-toplevel"]);
      const head = git(absolutePath, ["rev-parse", "HEAD"]);
      const status = git(absolutePath, ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"]);
      if (!topLevel || resolve(topLevel.toString("utf8").trim()) !== absolutePath || !head || !status || status.length > 0) return null;
      return { type: "submodule", mode: stat.mode & 0o7777, value: head };
    }
    return null;
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

// Null means the path cannot be classified safely. Treat unknown paths as
// relevant: only known prose, images, and generated reports can be skipped.
export function isVerificationRelevantPath(path) {
  const bytes = Buffer.isBuffer(path) ? path : Buffer.from(path);
  const relativePath = bytes.toString("utf8");
  if (!Buffer.from(relativePath).equals(bytes) || !relativePath || relativePath.startsWith("/")) return null;
  if (/^(?:\.claude|\.codex)\/plus-ultra\/state\//.test(relativePath)) return false;
  if (/^(?:coverage|playwright-report|test-results)\//.test(relativePath)) return false;
  if (/^(?:src|app|apps|packages|tests?|fixtures|public|generated|scripts|skills|hooks|commands|agents|specs|designs|docs|\.github)\//.test(relativePath)) return true;
  if (/^(?:README(?:\.[^/]*)?|AGENTS\.md|CHANGELOG\.md|DESIGN\.md)$/.test(relativePath)) return true;
  if (/^(?:LICENSE|NOTICE|CODEOWNERS)$/.test(relativePath)) return false;
  if (/^[^/]+\.(?:md|markdown|mdx|txt|rst|adoc|png|jpe?g|gif|svg|webp|ico|pdf)$/i.test(relativePath)) return false;
  return true;
}

function relevantPaths(paths) {
  if (paths === null) return null;
  const selected = [];
  for (const path of paths) {
    const relevant = isVerificationRelevantPath(path);
    if (relevant === null) return null;
    if (relevant) selected.push(path);
  }
  return selected;
}

function relevantIndexEntries(index) {
  const entries = nullDelimited(index);
  if (entries === null) return null;
  const selected = [];
  for (const entry of entries) {
    const separator = entry.indexOf(9); // Git uses a tab between metadata and path.
    if (separator < 0) return null;
    const metadata = entry.subarray(0, separator).toString("ascii");
    if (!Buffer.from(metadata, "ascii").equals(entry.subarray(0, separator))) return null;
    if (!/^(?:100644|100755|120000|160000) [0-9a-f]{40}(?:[0-9a-f]{24})? 0$/.test(metadata)) return null;
    const relevant = isVerificationRelevantPath(entry.subarray(separator + 1));
    if (relevant === null) return null;
    if (relevant) selected.push(entry);
  }
  return selected;
}

// Hash the index and visible worktree state without mutating Git state. A null
// result means the hook cannot establish a trustworthy verification baseline.
export function workingTreeFingerprint(root) {
  try {
    const requestedRoot = typeof root === "object" ? projectRoot(root) : root || process.cwd();
    const repository = git(requestedRoot, ["rev-parse", "--show-toplevel"]);
    if (!repository) return null;

    const repositoryRoot = repository.toString("utf8").trim();
    if (!repositoryRoot) return null;

    const index = git(repositoryRoot, ["ls-files", "--stage", "-z"]);
    const tracked = git(repositoryRoot, ["ls-files", "-z"]);
    const untracked = git(repositoryRoot, ["ls-files", "--others", "--exclude-standard", "-z"]);
    if (!index || !tracked || !untracked) return null;

    const indexEntries = relevantIndexEntries(index);
    const trackedPaths = relevantPaths(nullDelimited(tracked));
    const untrackedPaths = relevantPaths(nullDelimited(untracked));
    if (indexEntries === null || trackedPaths === null || untrackedPaths === null) return null;

    const hash = createHash("sha256");
    addHashPart(hash, "plus-ultra-working-tree-fingerprint", "v2");
    for (const entry of indexEntries) addHashPart(hash, "index:entry", entry);
    if (!addWorktreePaths(hash, repositoryRoot, "tracked", trackedPaths)) return null;
    if (!addWorktreePaths(hash, repositoryRoot, "untracked", untrackedPaths)) return null;
    return hash.digest("hex");
  } catch {
    return null;
  }
}
