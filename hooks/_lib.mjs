// Shared helpers for plus-ultra hooks. Zero dependencies.

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
