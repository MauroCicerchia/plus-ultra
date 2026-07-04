import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = new URL("..", import.meta.url).pathname;

function readRelative(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

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

test("PR description reminder emits once after a successful commit with an open PR", () => {
  const cwd = mkdtempSync(join(tmpdir(), "plus-ultra-pr-reminder-"));
  const binDir = join(cwd, "bin");
  mkdirSync(binDir, { recursive: true });
  writeFileSync(
    join(binDir, "git"),
    `#!/usr/bin/env node\nif (process.argv.slice(2).join(" ") === "rev-parse --short HEAD") {\n  process.stdout.write("abc1234\\n");\n  process.exit(0);\n}\nprocess.exit(1);\n`
  );
  writeFileSync(
    join(binDir, "gh"),
    `#!/usr/bin/env node\nif (process.argv.slice(2).join(" ") === "pr view --json number,url") {\n  process.stdout.write(JSON.stringify({ number: 4, url: "https://github.com/acme/repo/pull/4" }));\n  process.exit(0);\n}\nprocess.exit(1);\n`
  );
  spawnSync("chmod", ["+x", join(binDir, "git")]);
  spawnSync("chmod", ["+x", join(binDir, "gh")]);

  const payload = {
    hook_event_name: "PostToolUse",
    cwd,
    model: "gpt-5.5",
    permission_mode: "default",
    session_id: "session-1",
    tool_name: "Bash",
    tool_input: { command: "git commit -m 'feat: add thing'" },
    tool_response: { exitCode: 0 },
    tool_use_id: "tool-1",
    transcript_path: null,
    turn_id: "turn-1",
  };

  try {
    const stdout = runHook("pr-description-reminder.mjs", payload, {
      cwd,
      env: { PATH: `${binDir}:${process.env.PATH}` },
    });

    assert.match(stdout, /PR #4 may need a description update after abc1234/);
    assert.match(stdout, /pull-request-descriptions/);
    assert.match(stdout, /gh pr edit/);

    const marker = JSON.parse(
      readFileSync(join(cwd, ".codex", "plus-ultra", "state", "session-1.json"), "utf8")
    );
    assert.equal(marker.prDescriptionReminderHead, "abc1234");
    assert.equal(marker.prDescriptionReminderPr, 4);

    const second = runHook("pr-description-reminder.mjs", payload, {
      cwd,
      env: { PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.equal(second, "");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("hook manifests include PR description reminder after Bash commands", () => {
  const codexHooks = readRelative("hooks/hooks-codex.json");
  const claudeHooks = readRelative("hooks/hooks.json");

  assert.match(codexHooks, /pr-description-reminder\.mjs/);
  assert.match(claudeHooks, /pr-description-reminder\.mjs/);
  assert.ok(existsSync(join(repoRoot, "hooks", "pr-description-reminder.mjs")));
});
