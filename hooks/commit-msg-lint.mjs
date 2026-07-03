#!/usr/bin/env node
// PreToolUse (Bash): validate a `git commit -m` header against Conventional
// Commits (see the plus-ultra:conventional-commits skill). Blocks a malformed
// header before the commit is created.
//
// Only inspects inline `-m` / `--message` commits — if the message comes from an
// editor or `-F <file>`, the header isn't visible here, so we allow (fail open).
import { readInput, debug, deny, allow } from "./_lib.mjs";

const input = await readInput();
debug("commit-msg-lint", input);

const cmd = String(input?.tool_input?.command ?? "");
const c = cmd.replace(/\s+/g, " ").trim();

// Only gate real commits.
if (!/\bgit\s+commit\b/.test(c)) allow();
if (/--dry-run\b/.test(c)) allow();

// Extract the first inline message: -m "…", -am '…', --message=…, --message …
// Handles short-flag clusters that include m (e.g. -sm, -am) and both quote styles.
function firstMessage(command) {
  // --message=VALUE or --message VALUE
  let m = command.match(/--message[= ]\s*("([^"]*)"|'([^']*)'|(\S+))/);
  if (m) return m[2] ?? m[3] ?? m[4] ?? "";
  // short flag cluster containing m, then the value as the next token
  m = command.match(/(?:^|\s)-[a-z]*m[a-z]*\s+("([^"]*)"|'([^']*)'|(\S+))/i);
  if (m) return m[2] ?? m[3] ?? m[4] ?? "";
  return null;
}

const msg = firstMessage(cmd);

// No inline message (editor / -F) → can't inspect, allow.
if (msg === null) allow();

const header = msg.split("\n")[0].trim();

// A merge/revert/fixup auto-header is fine.
if (/^(Merge|Revert|fixup!|squash!)\b/.test(header)) allow();

const TYPES = "feat|fix|docs|refactor|perf|test|build|ci|chore|revert";
const CONVENTIONAL = new RegExp(`^(${TYPES})(\\([a-z0-9._/-]+\\))?(!)?: .+`);

if (CONVENTIONAL.test(header)) allow();

deny(
  `Blocked by plus-ultra commit-msg-lint: commit header "${header}" is not a Conventional Commit.\n` +
    `Expected: type(scope): subject — where type is one of ${TYPES.split("|").join(", ")}.\n` +
    `Examples: "feat(web): add command palette", "fix(api): reject expired tokens".\n` +
    `See the plus-ultra:conventional-commits skill.`
);
