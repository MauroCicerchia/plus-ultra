import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = new URL("..", import.meta.url).pathname;

function runHook(script, payload, options = {}) {
  const result = spawnSync(process.execPath, [join(repoRoot, "hooks", script)], {
    cwd: options.cwd ?? repoRoot,
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
  });

  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function makeTempProject() {
  const root = mkdtempSync(join(tmpdir(), "plus-ultra-test-"));
  mkdirSync(join(root, "specs"), { recursive: true });
  writeFileSync(
    join(root, "specs", "001-codex-hooks.md"),
    "---\nstatus: in-progress\n---\n# Codex hooks\n"
  );
  return root;
}

test("session-start emits Codex additional context JSON", () => {
  const cwd = makeTempProject();
  try {
    const stdout = runHook(
      "session-start.mjs",
      {
        hook_event_name: "SessionStart",
        cwd,
        model: "gpt-5.5",
        permission_mode: "default",
        session_id: "session-1",
        transcript_path: null,
        turn_id: "turn-1",
      },
      { cwd }
    );

    const output = JSON.parse(stdout);
    assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(output.hookSpecificOutput.additionalContext, /plus-ultra spec status:/);
    assert.match(output.hookSpecificOutput.additionalContext, /001-codex-hooks\.md/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("auto-format formats files from Codex apply_patch payloads", () => {
  const cwd = mkdtempSync(join(tmpdir(), "plus-ultra-format-"));
  const binDir = join(cwd, "bin");
  const logPath = join(cwd, "npx-args.json");
  mkdirSync(binDir, { recursive: true });
  writeFileSync(
    join(binDir, "npx"),
    `#!/usr/bin/env node\nimport { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)));\n`
  );
  spawnSync("chmod", ["+x", join(binDir, "npx")]);

  try {
    runHook(
      "auto-format.mjs",
      {
        hook_event_name: "PostToolUse",
        cwd,
        model: "gpt-5.5",
        permission_mode: "default",
        session_id: "session-1",
        tool_name: "apply_patch",
        tool_input:
          "*** Begin Patch\n*** Update File: src/app.ts\n@@\n-old\n+new\n*** End Patch\n",
        tool_response: { exitCode: 0 },
        tool_use_id: "tool-1",
        transcript_path: null,
        turn_id: "turn-1",
      },
      { cwd, env: { PATH: `${binDir}:${process.env.PATH}` } }
    );

    const args = JSON.parse(readFileSync(logPath, "utf8"));
    assert.deepEqual(args, [
      "--no-install",
      "biome",
      "check",
      "--write",
      "--no-errors-on-unmatched",
      "src/app.ts",
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("test marker writes Codex session state under .codex", () => {
  const cwd = mkdtempSync(join(tmpdir(), "plus-ultra-marker-"));
  try {
    runHook(
      "test-marker.mjs",
      {
        hook_event_name: "PostToolUse",
        cwd,
        model: "gpt-5.5",
        permission_mode: "default",
        session_id: "session-1",
        tool_name: "Bash",
        tool_input: { command: "pnpm test" },
        tool_response: { exitCode: 0 },
        tool_use_id: "tool-1",
        transcript_path: null,
        turn_id: "turn-1",
      },
      { cwd }
    );

    const marker = JSON.parse(
      readFileSync(join(cwd, ".codex", "plus-ultra", "state", "session-1.json"), "utf8")
    );
    assert.equal(typeof marker.testPassedAt, "string");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
