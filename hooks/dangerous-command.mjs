#!/usr/bin/env node
// PreToolUse (Bash): block recursive force-deletes.
// Protected-branch pushes, forced or not, are integration-gate.mjs's job.
import { readInput, debug, deny, allow } from "./_lib.mjs";

const input = await readInput();
debug("dangerous-command", input);

const cmd = String(input?.tool_input?.command ?? "");
if (!cmd.trim()) allow();

// Normalize whitespace for matching (keep original for the reason message).
const c = cmd.replace(/\s+/g, " ").trim();

// rm -rf / rm -fr in any flag order (rm -r -f, rm -rf, rm --recursive --force),
// and the extra-dangerous --no-preserve-root.
const rmRecursive = /(^|[;&|]|\bsudo\b)\s*rm\b[^;&|]*/g;
for (const m of c.matchAll(rmRecursive)) {
  const seg = m[0];
  const hasR = /\s-\w*r|\s--recursive/.test(seg);
  const hasF = /\s-\w*f|\s--force/.test(seg);
  if ((hasR && hasF) || /--no-preserve-root/.test(seg)) {
    deny(
      `Blocked destructive command by plus-ultra: "${cmd}". Recursive force-delete is not allowed. Remove specific paths deliberately instead.`
    );
  }
}

allow();
