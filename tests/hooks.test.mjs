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
    join(root, "specs", "001-linked.md"),
    "---\nstatus: approved\nissue: 30\n---\n# Linked\n"
  );
  writeFileSync(
    join(root, "specs", "002-unlinked.md"),
    "---\nstatus: approved\n---\n# Unlinked\n"
  );
  writeFileSync(
    join(root, "specs", "003-history.md"),
    "---\nstatus: superseded\nissue: 31\n---\n# History\n"
  );
  writeFileSync(
    join(root, "specs", "004-malformed.md"),
    "---\nstatus: \"approved\n---\n# Malformed\n"
  );
  writeFileSync(
    join(root, "specs", "005-malformed-delimiter.md"),
    "---\nstatus: approved\n--- not a closing delimiter\n# Malformed delimiter\n"
  );
  writeFileSync(
    join(root, "specs", "006-body-frontmatter.md"),
    "# Notes\n\n---\nstatus: approved\nissue: 34\n---\nThis is body content, not frontmatter.\n"
  );
  writeFileSync(
    join(root, "specs", "007-commented-crlf.md"),
    "---\r\nstatus: approved # draft → approved → superseded\r\nissue: 32 # optional\r\n---\r\n# Commented CRLF\r\n"
  );
  return root;
}

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function makeGitProject({ typescript = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "plus-ultra-git-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "app.mjs"), "export const value = 1;\n");
  if (typescript) writeFileSync(join(root, "tsconfig.json"), "{}\n");

  runCommand("git", ["init", "--initial-branch=main"], root);
  runCommand("git", ["config", "user.email", "hooks@example.com"], root);
  runCommand("git", ["config", "user.name", "Hook tests"], root);
  runCommand("git", ["add", "."], root);
  runCommand("git", ["commit", "-m", "Initial commit"], root);
  return root;
}

function markerPayload(command, sessionId = "session-1") {
  return {
    hook_event_name: "PostToolUse",
    model: "gpt-5.5",
    permission_mode: "default",
    session_id: sessionId,
    tool_name: "Bash",
    tool_input: { command },
    tool_response: { exitCode: 0 },
    tool_use_id: "tool-1",
    transcript_path: null,
    turn_id: "turn-1",
  };
}

function commitPayload(sessionId = "session-1") {
  return {
    hook_event_name: "PreToolUse",
    model: "gpt-5.5",
    permission_mode: "default",
    session_id: sessionId,
    tool_name: "Bash",
    tool_input: { command: "git commit -m 'feat: guarded commit'" },
    tool_use_id: "tool-1",
    transcript_path: null,
    turn_id: "turn-1",
  };
}

function denialReason(output) {
  return JSON.parse(output).hookSpecificOutput.permissionDecisionReason;
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
    const context = output.hookSpecificOutput.additionalContext;
    assert.match(context, /Approved \(current technical contracts\):/);
    assert.match(context, /001-linked\.md \(Issue #30\)/);
    assert.match(context, /002-unlinked\.md/);
    assert.doesNotMatch(context, /003-history\.md/);
    assert.doesNotMatch(context, /004-malformed\.md/);
    assert.doesNotMatch(context, /005-malformed-delimiter\.md/);
    assert.doesNotMatch(context, /006-body-frontmatter\.md/);
    assert.match(context, /007-commented-crlf\.md \(Issue #32\)/);
    assert.doesNotMatch(context, /In progress|active spec/i);
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
  const cwd = makeGitProject();
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

test("test marker does not record a verification when the Git tree cannot be fingerprinted", () => {
  const cwd = mkdtempSync(join(tmpdir(), "plus-ultra-marker-"));
  try {
    runHook("test-marker.mjs", markerPayload("pnpm test"), { cwd });

    assert.equal(existsSync(join(cwd, ".codex", "plus-ultra", "state", "session-1.json")), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("commit gate accepts a successful test for the unchanged Git tree", () => {
  const cwd = makeGitProject();
  try {
    runHook("test-marker.mjs", markerPayload("pnpm test"), { cwd });

    const marker = JSON.parse(
      readFileSync(join(cwd, ".codex", "plus-ultra", "state", "session-1.json"), "utf8")
    );
    assert.equal(typeof marker.testPassedFor, "string");
    assert.equal(runHook("commit-gate.mjs", commitPayload(), { cwd }), "");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("commit gate rejects a test verification after an unstaged tracked change", () => {
  const cwd = makeGitProject();
  try {
    runHook("test-marker.mjs", markerPayload("pnpm test"), { cwd });
    writeFileSync(join(cwd, "src", "app.mjs"), "export const value = 2;\n");

    const output = runHook("commit-gate.mjs", commitPayload(), { cwd });
    assert.equal(
      denialReason(output),
      "Blocked by plus-ultra commit-gate: Verification stale: code changed since last successful test run. " +
        "Run the required checks (exit 0) before committing, then retry."
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("commit gate rejects a test verification after a staged change", () => {
  const cwd = makeGitProject();
  try {
    runHook("test-marker.mjs", markerPayload("pnpm test"), { cwd });
    writeFileSync(join(cwd, "src", "app.mjs"), "export const value = 2;\n");
    runCommand("git", ["add", "src/app.mjs"], cwd);

    const output = runHook("commit-gate.mjs", commitPayload(), { cwd });
    assert.match(output, /Verification stale: code changed since last successful test run\./);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("commit gate rejects a test verification after an untracked change", () => {
  const cwd = makeGitProject();
  try {
    runHook("test-marker.mjs", markerPayload("pnpm test"), { cwd });
    writeFileSync(join(cwd, "new-file.mjs"), "export const value = 2;\n");

    const output = runHook("commit-gate.mjs", commitPayload(), { cwd });
    assert.match(output, /Verification stale: code changed since last successful test run\./);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("commit gate requires a matching typecheck verification in TypeScript projects", () => {
  const cwd = makeGitProject({ typescript: true });
  try {
    runHook("test-marker.mjs", markerPayload("pnpm test"), { cwd });
    runHook("test-marker.mjs", markerPayload("pnpm typecheck"), { cwd });

    const marker = JSON.parse(
      readFileSync(join(cwd, ".codex", "plus-ultra", "state", "session-1.json"), "utf8")
    );
    assert.equal(typeof marker.typecheckPassedFor, "string");
    assert.equal(runHook("commit-gate.mjs", commitPayload(), { cwd }), "");

    writeFileSync(join(cwd, "src", "app.mjs"), "export const value = 2;\n");
    const output = runHook("commit-gate.mjs", commitPayload(), { cwd });
    assert.match(output, /Verification stale: code changed since last successful typecheck\./);
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

test("integration gate blocks the gh stack merge incident for Claude payloads", () => {
  const output = runHook("integration-gate.mjs", {
    session_id: "session-1",
    tool_name: "Bash",
    tool_input: { command: "gh stack merge --yes --squash" },
  });

  const decision = JSON.parse(output).hookSpecificOutput;
  assert.equal(decision.hookEventName, "PreToolUse");
  assert.equal(decision.permissionDecision, "deny");
  assert.match(decision.permissionDecisionReason, /gh stack merge/);
});

test("integration gate blocks direct merge and release operations while allowing review preparation", () => {
  const codexPayload = (command) => ({
    hook_event_name: "PreToolUse",
    cwd: repoRoot,
    session_id: "session-1",
    tool_name: "Bash",
    tool_input: { command },
  });

  for (const command of [
    "gh pr merge 42",
    "gh pr merge 42 --auto",
    "gh stack merge 42",
    "gh release create v1.2.3",
  ]) {
    const output = runHook("integration-gate.mjs", codexPayload(command));
    assert.equal(JSON.parse(output).hookSpecificOutput.permissionDecision, "deny", command);
  }

  for (const command of [
    "gh pr create --fill",
    "gh pr edit 42 --title 'Ready for review'",
    "gh stack submit",
    "gh pr merge --help",
    "gh release create v1.2.3 --dry-run",
  ]) {
    assert.equal(runHook("integration-gate.mjs", codexPayload(command)), "", command);
  }
});

test("integration gate parses nested and wrapped integration commands without matching prose", () => {
  const payload = (command) => ({
    hook_event_name: "PreToolUse",
    cwd: repoRoot,
    session_id: "session-1",
    tool_name: "Bash",
    tool_input: { command },
  });

  for (const command of [
    "CI=1 /usr/local/bin/gh pr merge 42",
    "env CI=1 command gh stack merge --yes --squash",
    "sudo -u builder gh release create v1.2.3",
    "bash -c 'gh pr merge 42'",
    'zsh -c "gh stack merge --yes --squash"',
    "eval 'gh release create v1.2.3'",
    "echo $(gh pr merge 42)",
    "printf `gh stack merge --yes --squash`",
    "true && gh pr merge 42; echo done",
    "gh pr create --fill && gh stack merge --yes --squash",
  ]) {
    const output = runHook("integration-gate.mjs", payload(command));
    assert.equal(JSON.parse(output).hookSpecificOutput.permissionDecision, "deny", command);
  }

  for (const command of [
    'echo "gh pr merge 42"',
    "grep -R 'gh stack merge' README.md",
    "printf '%s\\n' 'gh release create v1.2.3'",
    "bash -c 'gh pr merge --help'",
    "eval 'gh release create v1.2.3 --dry-run'",
  ]) {
    assert.equal(runHook("integration-gate.mjs", payload(command)), "", command);
  }
});

test("integration gate blocks protected, broad, and tag pushes while allowing review branch work", () => {
  const cwd = makeGitProject();
  try {
    runCommand("git", ["update-ref", "refs/remotes/origin/trunk", "HEAD"], cwd);
    runCommand("git", ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk"], cwd);
    runCommand("git", ["tag", "v1.2.3"], cwd);
    const payload = (command) => ({
      hook_event_name: "PreToolUse",
      cwd,
      session_id: "session-1",
      tool_name: "Bash",
      tool_input: { command },
    });

    for (const command of [
      "git push origin main",
      "git push origin master",
      "git push origin trunk",
      "git push origin HEAD:trunk",
      "git push --all origin",
      "git push --mirror origin",
      "git push origin --tags",
      "git push origin --follow-tags",
      "git push origin refs/tags/v1.2.3",
      "git push origin tag v1.2.3",
      "git push origin v1.2.3",
    ]) {
      const output = runHook("integration-gate.mjs", payload(command), { cwd });
      assert.equal(JSON.parse(output).hookSpecificOutput.permissionDecision, "deny", command);
    }

    for (const command of [
      "git push origin feature/integration-gate",
      "git push origin HEAD:feature/integration-gate",
      "git push origin main:feature/integration-gate",
      "git tag v1.2.4",
    ]) {
      assert.equal(runHook("integration-gate.mjs", payload(command), { cwd }), "", command);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("integration gate blocks recognized mutating GitHub APIs while allowing reads", () => {
  const payload = (command) => ({
    hook_event_name: "PreToolUse",
    cwd: repoRoot,
    session_id: "session-1",
    tool_name: "Bash",
    tool_input: { command },
  });

  for (const command of [
    "gh api --method PUT repos/acme/widget/pulls/42/merge",
    "gh api --hostname api.github.com --method PUT repos/acme/widget/pulls/42/merge",
    "gh api -X POST repos/acme/widget/pulls/42/auto-merge",
    "gh api --method POST repos/acme/widget/merge-queue/entries",
    "gh api --method POST repos/acme/widget/releases",
    "gh api --method PATCH repos/acme/widget/releases/7",
    "gh api --method POST repos/acme/widget/git/refs -f ref=refs/tags/v1.2.3",
    "gh api -X PATCH repos/acme/widget/git/refs/tags/v1.2.3",
    "gh api graphql -f query='mutation { mergePullRequest(input: {}) { pullRequest { id } } }'",
    "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {}) { pullRequest { id } } }'",
    "gh api graphql -f query='mutation { enqueuePullRequest(input: {}) { clientMutationId } }'",
    "gh api graphql -f query='mutation { createRelease(input: {}) { release { id } } }'",
    "gh api graphql -f query='mutation { updateRef(input: {}) { ref { id } } }' -f refName=refs/tags/v1.2.3",
  ]) {
    const output = runHook("integration-gate.mjs", payload(command));
    assert.equal(JSON.parse(output).hookSpecificOutput.permissionDecision, "deny", command);
  }

  for (const command of [
    "gh api repos/acme/widget/pulls/42",
    "gh api --method GET repos/acme/widget/pulls/42/merge",
    "gh api --method GET repos/acme/widget/releases/latest",
    "gh api --method POST repos/acme/widget/issues -f title='Ready for review'",
    "gh api graphql -f query='query { viewer { login } }'",
    "gh api --method PUT repos/acme/widget/pulls/42/merge --dry-run",
  ]) {
    assert.equal(runHook("integration-gate.mjs", payload(command)), "", command);
  }
});

test("integration gate fails open for malformed shell input and unavailable local Git references", () => {
  const cwd = mkdtempSync(join(tmpdir(), "plus-ultra-integration-gate-"));
  try {
    const payload = (command) => ({
      hook_event_name: "PreToolUse",
      cwd,
      session_id: "session-1",
      tool_name: "Bash",
      tool_input: { command },
    });

    assert.equal(runHook("integration-gate.mjs", payload("gh pr merge 'unterminated"), { cwd }), "");
    assert.equal(runHook("integration-gate.mjs", payload("git push origin trunk"), { cwd }), "");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("integration gate recognizes operational wrappers and leaves escaped prose alone", () => {
  const payload = (command) => ({
    hook_event_name: "PreToolUse",
    cwd: repoRoot,
    session_id: "session-1",
    tool_name: "Bash",
    tool_input: { command },
  });

  for (const command of [
    "nice -n 5 gh pr merge 42",
    "timeout 10 gh release create v1.2.3",
    "xargs -n 1 gh stack merge --yes --squash",
  ]) {
    const output = runHook("integration-gate.mjs", payload(command));
    assert.equal(JSON.parse(output).hookSpecificOutput.permissionDecision, "deny", command);
  }

  for (const command of [
    "echo 'example; gh pr merge 42'",
    "echo \\`gh pr merge 42\\`",
    "grep -R 'gh stack merge --yes --squash' README.md",
  ]) {
    assert.equal(runHook("integration-gate.mjs", payload(command)), "", command);
  }
});
