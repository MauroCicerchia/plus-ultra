// Shared helpers for plus-ultra hooks. Zero dependencies.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

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

// Per-session state dir under the project, created lazily.
export function stateDir() {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return `${root}/.claude/plus-ultra/state`;
}

// Per-session marker file (records testPassedAt / typecheckPassedAt).
export function markerPath(sessionId) {
  return `${stateDir()}/${String(sessionId || "default")}.json`;
}

// Read the session marker as an object, or {} if absent/invalid.
export function readMarker(sessionId) {
  try {
    return JSON.parse(readFileSync(markerPath(sessionId), "utf8"));
  } catch {
    return {};
  }
}

// Merge fields into the session marker. Never throws.
export function mergeMarker(sessionId, patch) {
  try {
    mkdirSync(stateDir(), { recursive: true });
    writeFileSync(markerPath(sessionId), JSON.stringify({ ...readMarker(sessionId), ...patch }, null, 2));
  } catch {
    // never disrupt the session over a marker write failure
  }
}

// Does this project use TypeScript? True if a tsconfig.json exists at the root
// or in any immediate apps/* or packages/* workspace (monorepo layout).
export function isTsProject(root) {
  const base = root || process.env.CLAUDE_PROJECT_DIR || process.cwd();
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
