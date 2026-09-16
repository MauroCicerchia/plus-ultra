import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  aggregateMeasurements,
  assessComparability,
  calculateBudgets,
  canonicalSha256,
  measureJsonl,
  median,
  parseJsonl,
  rankContributors,
  requiresThirdSample,
  sanitizeBaseline,
} from "../scripts/benchmark/core.mjs";
import { runBenchmark } from "../scripts/benchmark/runner.mjs";

const exact = (value) => ({ value, label: "exact" });
const observed = (value) => ({ value, label: "observed" });
const hash = "a".repeat(64);
const testRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const benchmarkCli = join(testRoot, "scripts", "benchmark-workflows.mjs");

function sample(overrides = {}) {
  return {
    input_tokens: exact(100),
    cached_input_tokens: exact(40),
    non_cached_input_tokens: observed(60),
    output_tokens: exact(20),
    reasoning_tokens: exact(null),
    turns: observed(1),
    item_types: observed(["agent_message"]),
    tool_call_types: observed([]),
    tool_calls: observed(0),
    elapsed_ms: observed(500),
    visible_context_bytes: observed(200),
    ...overrides,
  };
}

function baseline(overrides = {}) {
  return {
    schema_version: 1,
    profile: { model: "gpt-5.6-sol", reasoning_effort: "medium" },
    hashes: {
      scenario: {
        "product-discovery": hash,
        "spec-refinement": hash,
        "fast-implementation": hash,
        "standard-implementation": hash,
        "pr-review-cycle": hash,
      },
      prompts: hash,
      fixture: hash,
      fake_github: hash,
      suite: hash,
      git_tree: hash,
      plugin_tree: hash,
    },
    phases: [{ phase: "fast-implementation", aggregate: sample() }],
    budgets: {
      "fast-implementation": {
        input_tokens: 1000,
        cached_input_tokens: 1000,
        non_cached_input_tokens: 1000,
        output_tokens: 100,
        reasoning_tokens: null,
        turns: 2,
        tool_calls: 0,
        visible_context_bytes: 1024,
      },
    },
    contributors: [{ name: "AGENTS.md", bytes: 100, label: "observed" }],
    environment: {
      codex_version: "1.2.3",
      operating_system: "darwin",
      architecture: "arm64",
    },
    ...overrides,
  };
}

test("parseJsonl parses valid records and ignores blank lines", () => {
  const result = parseJsonl('{"type":"thread.started"}\n\n{"type":"turn.started"}\n');

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.map(({ type }) => type), ["thread.started", "turn.started"]);
});

test("parseJsonl reports malformed JSON with its source line", () => {
  const result = parseJsonl('{"type":"turn.started"}\nnot-json\n');

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "malformed_jsonl",
      line: 2,
      message: "JSONL line 2 is not valid JSON",
    },
  });
});

test("measureJsonl retains exact usage, derives non-cached input, and counts events", () => {
  const jsonl = [
    JSON.stringify({ type: "thread.started", thread_id: "secret" }),
    JSON.stringify({ type: "turn.started" }),
    JSON.stringify({
      type: "item.started",
      item: { id: "1", type: "command_execution", command: "node --test" },
    }),
    JSON.stringify({
      type: "item.completed",
      item: { id: "1", type: "command_execution", aggregated_output: "ok\n" },
    }),
    JSON.stringify({
      type: "item.completed",
      item: { id: "2", type: "agent_message", text: "done" },
    }),
    JSON.stringify({
      type: "turn.completed",
      usage: {
        input_tokens: 1500,
        cached_input_tokens: 400,
        output_tokens: 250,
        reasoning_output_tokens: 75,
      },
    }),
  ].join("\n");

  const result = measureJsonl(jsonl, { elapsedMs: 1234 });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    input_tokens: exact(1500),
    cached_input_tokens: exact(400),
    non_cached_input_tokens: observed(1100),
    output_tokens: exact(250),
    reasoning_tokens: exact(75),
    turns: observed(1),
    item_types: observed(["agent_message", "command_execution"]),
    tool_call_types: observed(["command_execution"]),
    tool_calls: observed(1),
    elapsed_ms: observed(1234),
    visible_context_bytes: observed(18),
  });
});

test("measureJsonl keeps missing usage fields null and ignores unrelated events", () => {
  const result = measureJsonl(
    [
      JSON.stringify({ type: "unrelated.event", usage: { input_tokens: 999 } }),
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10 } }),
    ].join("\n")
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.input_tokens, exact(10));
  assert.deepEqual(result.value.cached_input_tokens, exact(null));
  assert.deepEqual(result.value.non_cached_input_tokens, observed(null));
  assert.deepEqual(result.value.output_tokens, exact(null));
  assert.deepEqual(result.value.reasoning_tokens, exact(null));
  assert.deepEqual(result.value.elapsed_ms, observed(null));
});

test("measureJsonl sums exact usage only when every completed turn exposes it", () => {
  const complete = measureJsonl(
    [
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 2 },
      }),
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 20, cached_input_tokens: 5, output_tokens: 3 },
      }),
    ].join("\n")
  );
  const incomplete = measureJsonl(
    [
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10 } }),
      JSON.stringify({ type: "turn.completed", usage: { output_tokens: 3 } }),
    ].join("\n")
  );

  assert.deepEqual(complete.value.input_tokens, exact(30));
  assert.deepEqual(complete.value.cached_input_tokens, exact(9));
  assert.deepEqual(complete.value.non_cached_input_tokens, observed(21));
  assert.deepEqual(incomplete.value.input_tokens, exact(null));
  assert.deepEqual(incomplete.value.output_tokens, exact(null));
});

test("measureJsonl rejects structurally invalid and inconsistent usage", () => {
  const invalid = measureJsonl(
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: "10" } })
  );
  const inconsistent = measureJsonl(
    JSON.stringify({
      type: "turn.completed",
      usage: { input_tokens: 10, cached_input_tokens: 11 },
    })
  );
  const invalidReasoning = measureJsonl(
    JSON.stringify({
      type: "turn.completed",
      usage: { reasoning_output_tokens: "75" },
    })
  );

  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, "invalid_usage");
  assert.match(invalid.error.message, /input_tokens/);
  assert.equal(inconsistent.ok, false);
  assert.equal(inconsistent.error.code, "inconsistent_usage");
  assert.equal(invalidReasoning.ok, false);
  assert.equal(invalidReasoning.error.code, "invalid_usage");
  assert.match(invalidReasoning.error.message, /reasoning_output_tokens/);
});

test("requiresThirdSample uses exact total tokens and a strict 10 percent boundary", () => {
  const first = sample({ input_tokens: exact(75) });
  const below = requiresThirdSample(first, sample({ input_tokens: exact(84) }));
  const boundary = requiresThirdSample(first, sample({ input_tokens: exact(85) }));
  const above = requiresThirdSample(first, sample({ input_tokens: exact(86) }));

  assert.deepEqual(below, {
    ok: true,
    value: { required: false, metric: "total_tokens", relative_difference: 9 / 99.5 },
  });
  assert.deepEqual(boundary, {
    ok: true,
    value: { required: false, metric: "total_tokens", relative_difference: 0.1 },
  });
  assert.deepEqual(above, {
    ok: true,
    value: { required: true, metric: "total_tokens", relative_difference: 11 / 100.5 },
  });
});

test("requiresThirdSample falls back to visible bytes and handles zero medians", () => {
  const unavailableTokens = (bytes) =>
    sample({
      input_tokens: exact(null),
      output_tokens: exact(null),
      visible_context_bytes: observed(bytes),
    });

  assert.deepEqual(requiresThirdSample(unavailableTokens(0), unavailableTokens(0)), {
    ok: true,
    value: { required: false, metric: "visible_context_bytes", relative_difference: 0 },
  });
  assert.deepEqual(requiresThirdSample(unavailableTokens(0), unavailableTokens(1)), {
    ok: true,
    value: { required: true, metric: "visible_context_bytes", relative_difference: 2 },
  });
  assert.deepEqual(
    requiresThirdSample(
      unavailableTokens(null),
      unavailableTokens(null)
    ),
    {
      ok: true,
      value: { required: false, metric: null, relative_difference: null },
    }
  );
});

test("measureJsonl accepts a directly observed visible-context byte count", () => {
  const result = measureJsonl(JSON.stringify({ type: "turn.completed" }), {
    visibleContextBytes: 4096,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.visible_context_bytes, observed(4096));
});

test("measureJsonl counts repeated tool calls independently from their types", () => {
  const result = measureJsonl(
    [
      JSON.stringify({
        type: "item.completed",
        item: { id: "1", type: "command_execution" },
      }),
      JSON.stringify({
        type: "item.completed",
        item: { id: "2", type: "command_execution" },
      }),
    ].join("\n")
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.tool_call_types, observed(["command_execution"]));
  assert.deepEqual(result.value.tool_calls, observed(2));
});

test("measureJsonl preserves reset item IDs across resumed Codex invocations", () => {
  const result = measureJsonl(
    [
      JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
      JSON.stringify({
        type: "item.completed",
        item: { id: "item_1", type: "command_execution" },
      }),
      JSON.stringify({ type: "turn.completed" }),
      JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
      JSON.stringify({
        type: "item.completed",
        item: { id: "item_1", type: "command_execution" },
      }),
      JSON.stringify({ type: "turn.completed" }),
    ].join("\n")
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.tool_calls, observed(2));
});

test("requiresThirdSample rejects failed samples", () => {
  const result = requiresThirdSample(
    { status: "failed", error: "boom" },
    { status: "success", measurement: sample() }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unsuccessful_sample");
});

test("median handles odd and even numeric values without mutating input", () => {
  const even = [40, 10, 30, 20];

  assert.equal(median(even), 25);
  assert.deepEqual(even, [40, 10, 30, 20]);
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([]), null);
});

test("aggregateMeasurements takes numeric medians and deterministic type unions", () => {
  const measurements = [
    sample(),
    sample({
      input_tokens: exact(200),
      cached_input_tokens: exact(null),
      non_cached_input_tokens: observed(null),
      item_types: observed(["command_execution", "agent_message"]),
      tool_call_types: observed(["command_execution"]),
    }),
    sample({ input_tokens: exact(300), item_types: observed(["reasoning"]) }),
  ];

  const result = aggregateMeasurements(measurements);

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.input_tokens, exact(200));
  assert.deepEqual(result.value.cached_input_tokens, exact(null));
  assert.deepEqual(result.value.non_cached_input_tokens, observed(null));
  assert.deepEqual(
    result.value.item_types,
    observed(["agent_message", "command_execution", "reasoning"])
  );
  assert.deepEqual(result.value.tool_call_types, observed(["command_execution"]));
  assert.deepEqual(measurements[1].item_types.value, ["command_execution", "agent_message"]);
});

test("aggregateMeasurements rejects an empty or unsuccessful sample set", () => {
  assert.equal(aggregateMeasurements([]).error.code, "missing_samples");
  assert.equal(
    aggregateMeasurements([{ status: "failed", error: "boom" }]).error.code,
    "unsuccessful_sample"
  );
});

test("measurement consumers reject missing fields, negative values, and invalid labels", () => {
  const malformed = {};
  const negative = sample({ input_tokens: exact(-1) });
  const invalidLabel = sample({ output_tokens: { value: 20, label: "measured" } });

  for (const result of [
    requiresThirdSample(malformed, sample()),
    aggregateMeasurements([malformed]),
    calculateBudgets(malformed),
    requiresThirdSample(negative, sample()),
    aggregateMeasurements([negative]),
    calculateBudgets(negative),
    requiresThirdSample(invalidLabel, sample()),
  ]) {
    assert.equal(result.ok, false);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.error), true);
    assert.match(result.error.code, /^invalid_/);
  }
});

test("requiresThirdSample uses bytes when available token metrics are not exact", () => {
  const first = sample({
    input_tokens: observed(100),
    output_tokens: observed(20),
    visible_context_bytes: observed(100),
  });
  const second = sample({
    input_tokens: observed(1000),
    output_tokens: observed(200),
    visible_context_bytes: observed(105),
  });

  assert.deepEqual(requiresThirdSample(first, second), {
    ok: true,
    value: {
      required: false,
      metric: "visible_context_bytes",
      relative_difference: 5 / 102.5,
    },
  });
});

test("calculateBudgets adds 20 percent with metric-specific upper rounding", () => {
  const result = calculateBudgets(
    sample({
      input_tokens: exact(1001),
      cached_input_tokens: exact(1000),
      non_cached_input_tokens: observed(1),
      output_tokens: exact(101),
      reasoning_tokens: exact(100),
      turns: observed(2.5),
      tool_calls: observed(2),
      visible_context_bytes: observed(1025),
    })
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    input_tokens: 2000,
    cached_input_tokens: 2000,
    non_cached_input_tokens: 1000,
    output_tokens: 200,
    reasoning_tokens: 1000,
    turns: 3,
    tool_calls: 3,
    visible_context_bytes: 2048,
  });
});

test("calculateBudgets preserves unavailable values as null", () => {
  const result = calculateBudgets(
    sample({
      input_tokens: exact(null),
      cached_input_tokens: exact(null),
      non_cached_input_tokens: observed(null),
      output_tokens: exact(null),
      reasoning_tokens: exact(null),
      turns: observed(null),
      tool_call_types: observed(null),
      tool_calls: observed(null),
      visible_context_bytes: observed(null),
    })
  );

  assert.deepEqual(result.value, {
    input_tokens: null,
    cached_input_tokens: null,
    non_cached_input_tokens: null,
    output_tokens: null,
    reasoning_tokens: null,
    turns: null,
    tool_calls: null,
    visible_context_bytes: null,
  });
});

test("rankContributors sorts by descending bytes then stable name order", () => {
  const contributors = [
    { name: "tool payloads", bytes: 20, label: "observed" },
    { name: "AGENTS.md", bytes: 50, label: "observed" },
    { name: "durable artifacts", bytes: 20, label: "estimated" },
  ];

  const result = rankContributors(contributors);

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.map(({ name }) => name), [
    "AGENTS.md",
    "durable artifacts",
    "tool payloads",
  ]);
  assert.deepEqual(contributors.map(({ name }) => name), [
    "tool payloads",
    "AGENTS.md",
    "durable artifacts",
  ]);
});

test("canonicalSha256 is independent of object key order and sensitive to array order", () => {
  assert.equal(
    canonicalSha256({ b: 2, a: { d: 4, c: 3 } }),
    canonicalSha256({ a: { c: 3, d: 4 }, b: 2 })
  );
  assert.notEqual(canonicalSha256(["a", "b"]), canonicalSha256(["b", "a"]));
  assert.match(canonicalSha256({ value: "stable" }), /^[a-f0-9]{64}$/);
});

test("sanitizeBaseline allow-lists durable aggregate fields and strips raw content", () => {
  const input = baseline({
    stderr: "secret",
    response: "secret",
    thread_id: "secret",
  });
  input.phases[0].samples = [{ response: "secret" }];

  const result = sanitizeBaseline(input);

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    schema_version: 1,
    profile: { model: "gpt-5.6-sol", reasoning_effort: "medium" },
    hashes: {
      scenario: baseline().hashes.scenario,
      prompts: hash,
      fixture: hash,
      fake_github: hash,
      suite: hash,
      git_tree: hash,
      plugin_tree: hash,
    },
    phases: [{ phase: "fast-implementation", aggregate: sample() }],
    budgets: baseline().budgets,
    contributors: [{ name: "AGENTS.md", bytes: 100, label: "observed" }],
    environment: {
      codex_version: "1.2.3",
      operating_system: "darwin",
      architecture: "arm64",
    },
  });
  assert.doesNotMatch(JSON.stringify(result.value), /secret|\/Users\//);
});

test("sanitizeBaseline rejects absolute paths in otherwise allowed string fields", () => {
  for (const path of [
    "/etc/passwd",
    "/workspace/x",
    "//server/share/model",
    "///workspace/x",
    "C:\\Users\\person\\x",
    "\\\\server\\share\\x",
  ]) {
    const input = baseline({ stderr: { nested: { path } } });
    const result = sanitizeBaseline(input);

    assert.equal(result.ok, false, path);
    assert.equal(result.error.code, "unsafe_baseline", path);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.error), true);
  }
});

test("sanitizeBaseline rejects absolute and unexpected scenario hash keys", () => {
  const absoluteKey = baseline();
  absoluteKey.hashes.scenario = { "/private/secret-scenario.json": hash };
  const unexpectedKey = baseline();
  unexpectedKey.hashes.scenario.unexpected = hash;

  const unsafe = sanitizeBaseline(absoluteKey);
  assert.equal(unsafe.ok, false);
  assert.equal(unsafe.error.code, "unsafe_baseline");

  const unexpected = sanitizeBaseline(unexpectedKey);
  assert.equal(unexpected.ok, false);
  assert.equal(unexpected.error.code, "invalid_baseline");
});

test("sanitizeBaseline rejects nested raw objects and malformed phases", () => {
  const nestedRaw = baseline();
  nestedRaw.phases[0].aggregate.input_tokens.value = { response: "secret" };

  for (const input of [nestedRaw, baseline({ phases: [null] })]) {
    const result = sanitizeBaseline(input);
    assert.equal(result.ok, false);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.error), true);
  }
});

test("sanitizeBaseline rejects malformed hashes, contributors, budgets, and profiles", () => {
  const badHash = baseline();
  badHash.hashes.suite = "short";
  const badContributor = baseline();
  badContributor.contributors[0].bytes = -1;
  const badBudget = baseline();
  badBudget.budgets["fast-implementation"].raw_response = { text: "secret" };
  const badProfile = baseline();
  badProfile.profile.model = { response: "secret" };

  for (const input of [badHash, badContributor, badBudget, badProfile]) {
    const result = sanitizeBaseline(input);
    assert.equal(result.ok, false);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.error), true);
  }
});

test("assessComparability enforces token identity fields and reports drift", () => {
  const baseline = {
    model: "gpt-5.6-sol",
    reasoning_effort: "medium",
    codex_version: "1.2.3",
    suite_hash: "suite",
    scenario_hash: "scenario",
    operating_system: "darwin",
    architecture: "arm64",
  };

  assert.deepEqual(assessComparability(baseline, { ...baseline }, "input_tokens"), {
    comparable: true,
    drift: [],
  });
  assert.deepEqual(
    assessComparability(baseline, { ...baseline, model: "another" }, "input_tokens"),
    { comparable: false, drift: ["model"] }
  );
});

test("assessComparability adds operating system and architecture for elapsed time", () => {
  const baseline = {
    model: "gpt-5.6-sol",
    reasoning_effort: "medium",
    codex_version: "1.2.3",
    suite_hash: "suite",
    scenario_hash: "scenario",
    operating_system: "darwin",
    architecture: "arm64",
  };
  const candidate = { ...baseline, operating_system: "linux", architecture: "x64" };

  assert.deepEqual(assessComparability(baseline, candidate, "output_tokens"), {
    comparable: true,
    drift: [],
  });
  assert.deepEqual(assessComparability(baseline, candidate, "elapsed_ms"), {
    comparable: false,
    drift: ["operating_system", "architecture"],
  });
});

const canonicalScenarios = [
  ["product-discovery", ["product-discovery"]],
  ["spec-refinement", ["spec-refinement"]],
  ["fast-implementation", ["fast-implementation"]],
  ["standard-implementation", ["standard-implementation"]],
  ["pr-review-cycle", ["first-pr-review", "pr-re-review"]],
];

test("benchmark documentation exposes the manual safe workflow", () => {
  const guide = readFileSync(join(testRoot, "docs", "benchmarking.md"), "utf8");
  const readme = readFileSync(join(testRoot, "README.md"), "utf8");

  for (const required of [
    "gpt-5.6-sol",
    "reasoning `medium`",
    "exact",
    "observed",
    "estimated",
    "adaptive",
    "inventory",
    "record",
    "compare",
    "environment drift",
    ".context/benchmarks/",
    "failed repository",
    "Recover one failed scenario",
    "attempts/<scenario>-attempt-N/",
    "do not splice or hand-edit summaries",
    "node scripts/codex-local.mjs restore",
    "manual",
  ]) {
    assert.match(guide, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.match(readme, /\[Workflow benchmarking\]\(docs\/benchmarking\.md\)/);
});

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function runGit(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fakeCodexSource() {
  return `#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args[0] === "--version") {
  process.stdout.write("codex-cli 1.2.3\\n");
  process.exit(0);
}
if (args.join(" ") === "plugin marketplace list --json") {
  process.stdout.write(JSON.stringify({ marketplaces: [{
    name: "plus-ultra-dev",
    root: process.env.FAKE_CODEX_MARKETPLACE_ROOT,
  }] }) + "\\n");
  process.exit(0);
}
if (args.join(" ") === "plugin list --marketplace plus-ultra-dev --json") {
  process.stdout.write(JSON.stringify({ installed: [{
    pluginId: "plus-ultra@plus-ultra-dev",
    installed: true,
    enabled: true,
  }] }) + "\\n");
  process.exit(0);
}
const record = {
  args,
  codex_home: process.env.CODEX_HOME,
  cwd: process.cwd(),
  home: process.env.HOME,
  phase: process.env.PLUS_ULTRA_BENCHMARK_PHASE,
  scenario: process.env.PLUS_ULTRA_BENCHMARK_SCENARIO,
  sample: Number(process.env.PLUS_ULTRA_BENCHMARK_SAMPLE),
  turn: Number(process.env.PLUS_ULTRA_BENCHMARK_TURN),
  zdotdir: process.env.ZDOTDIR,
};
appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify(record) + "\\n");
if (process.env.FAKE_CODEX_SHELL_PROBE_PHASE === record.phase) {
  for (const shell of ["/bin/zsh", "/bin/bash", "/bin/sh"].filter(existsSync)) {
    const located = spawnSync(shell, ["-lc", "command -v gh"], {
      encoding: "utf8",
      env: process.env,
    });
    const invoked = spawnSync(
      shell,
      [
        "-lc",
        'PLUS_ULTRA_BENCHMARK_GH_STATE="$PWD/redirected-state.json" PLUS_ULTRA_BENCHMARK_GH_LOG="$PWD/redirected-gh.jsonl" gh probe',
      ],
      { encoding: "utf8", env: process.env }
    );
    appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify({
      event: "shell_probe",
      shell,
      resolved: located.stdout.trim(),
      locate_status: located.status,
      invoke_status: invoked.status,
      invoke_stderr: invoked.stderr,
    }) + "\\n");
    if (located.status !== 0 || invoked.status !== 0) process.exit(71);
  }
}
if (process.env.FAKE_CODEX_MARKER_PHASE === record.phase) {
  mkdirSync(".codex/plus-ultra/state", { recursive: true });
  writeFileSync(".codex/plus-ultra/state/benchmark-session.json", "{}\\n");
}
if (process.env.FAKE_CODEX_ARBITRARY_CODEX_PHASE === record.phase) {
  mkdirSync(".codex", { recursive: true });
  writeFileSync(".codex/unexpected.txt", "must remain scope-visible\\n");
}
const prompt = args.at(-1);
if (prompt.includes("CLEAN_CREATED_THREAD")) {
  const cleanup = spawnSync("gh", ["delete-thread", "benchmark-created"], {
    encoding: "utf8",
    env: process.env,
  });
  if (cleanup.status !== 0) {
    process.stderr.write(cleanup.stderr);
    process.exit(cleanup.status ?? 9);
  }
}
writeFileSync("result.txt", record.phase + " complete\\n");
if (process.env.FAKE_CODEX_OUT_OF_SCOPE_PHASE === record.phase) {
  writeFileSync("outside-workflow-scope.txt", "unexpected\\n");
}
if (
  process.env.FAKE_CODEX_FAIL_PHASE === record.phase &&
  record.sample === Number(process.env.FAKE_CODEX_FAIL_SAMPLE ?? "1") &&
  record.turn === 1
) {
  process.stderr.write("synthetic failure at /private/fixture/repository\\n");
  process.exit(7);
}
const adaptive = process.env.FAKE_CODEX_ADAPTIVE_PHASE === record.phase;
const input = adaptive ? [100, 200, 150][record.sample - 1] : 100;
const threadId = record.scenario + "-sample-" + record.sample;
if (!args.includes("resume")) {
  process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: threadId }) + "\\n");
}
process.stdout.write(JSON.stringify({
  type: "item.completed",
  item: { id: "message-" + record.turn, type: "agent_message", text: "model response /private/secret" },
}) + "\\n");
process.stdout.write(JSON.stringify({
  type: "turn.completed",
  usage: { input_tokens: input, cached_input_tokens: 25, output_tokens: 20, reasoning_output_tokens: 5 },
}) + "\\n");
`;
}

const canonicalTagFilteringTestSource = `import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { formatEntry } from "../src/format.mjs";
import { addEntry, filterByTag } from "../src/library.mjs";

test("supports repeatable normalized tags through the CLI", () => {
  const original = [{ id: 9, title: "Dune", read: false }];
  assert.throws(() => addEntry(original, "   "), /title is required/);
  const updated = addEntry(original, "The Left Hand", ["Sci-Fi", " fiction ", "sci-fi"]);
  assert.deepEqual(updated.at(-1), {
    id: 10,
    title: "The Left Hand",
    read: false,
    tags: ["fiction", "sci-fi"],
  });
  assert.deepEqual(original, [{ id: 9, title: "Dune", read: false }]);
  const beforeFilter = JSON.parse(JSON.stringify(updated));
  const filtered = filterByTag(updated, "SCI-FI");
  assert.deepEqual(filtered, [updated.at(-1)]);
  assert.notEqual(filtered, updated);
  assert.deepEqual(updated, beforeFilter);
  assert.equal(formatEntry(original[0]), "[ ] 9 Dune");
  assert.equal(formatEntry(updated.at(-1)), "[ ] 10 The Left Hand #fiction #sci-fi");

  const directory = mkdtempSync(join(tmpdir(), "reading-list-tags-"));
  try {
    const dataPath = join(directory, "entries.json");
    writeFileSync(dataPath, JSON.stringify(original));
    const environment = { ...process.env, READING_LIST_FILE: dataPath };
    const add = spawnSync(process.execPath, ["src/cli.mjs", "add", "Kindred", "--tag", "Sci-Fi", "--tag", "classic", "--tag", "sci-fi"], { encoding: "utf8", env: environment });
    assert.equal(add.status, 0, add.stderr);
    assert.equal(add.stdout, "Added 10\\n");
    const saved = JSON.parse(readFileSync(dataPath, "utf8"));
    assert.deepEqual(saved.at(-1).tags, ["classic", "sci-fi"]);
    const list = spawnSync(process.execPath, ["src/cli.mjs", "list", "--tag", "SCI-FI"], { encoding: "utf8", env: environment });
    assert.equal(list.status, 0, list.stderr);
    assert.equal(list.stdout, "[ ] 10 Kindred #classic #sci-fi\\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
`;

function versionedFakeCodexSource() {
  const taggedLibrary = `import { normalizeTitle } from "./format.mjs";

function normalizeTag(value) {
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) throw new Error("tag is required");
  return normalized;
}

export function addEntry(entries, title, tags = []) {
  const normalized = normalizeTitle(title);
  if (!normalized) throw new Error("title is required");
  const nextId = entries.reduce((largest, entry) => Math.max(largest, entry.id), 0) + 1;
  const normalizedTags = [...new Set(tags.map(normalizeTag))].sort();
  const entry = { id: nextId, title: normalized, read: false };
  return [...entries, normalizedTags.length > 0 ? { ...entry, tags: normalizedTags } : entry];
}

export function markRead(entries, id) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) throw new Error("id must be an integer");
  let found = false;
  const updated = entries.map((entry) => {
    if (entry.id !== numericId) return entry;
    found = true;
    return { ...entry, read: true };
  });
  if (!found) throw new Error("entry " + id + " was not found");
  return updated;
}

export function filterByTag(entries, tag) {
  const normalized = normalizeTag(tag);
  return entries.filter((entry) => (entry.tags ?? []).includes(normalized));
}
`;
  const taggedFormat = `export function normalizeTitle(value) {
  if (typeof value !== "string") throw new TypeError("title must be a string");
  return value.trim().replace(/ {2,}/g, " ");
}

export function formatEntry(entry) {
  const tags = [...(entry.tags ?? [])].sort().map((tag) => " #" + tag).join("");
  return (entry.read ? "[x]" : "[ ]") + " " + entry.id + " " + entry.title + tags;
}
`;
  const taggedCli = `#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatEntry } from "./format.mjs";
import { addEntry, filterByTag, markRead } from "./library.mjs";

const dataPath = resolve(process.env.READING_LIST_FILE ?? ".reading-list.json");
const load = () => {
  if (!existsSync(dataPath)) return [];
  const value = JSON.parse(readFileSync(dataPath, "utf8"));
  if (!Array.isArray(value)) throw new Error("reading-list data must be an array");
  return value;
};
const save = (entries) => writeFileSync(dataPath, JSON.stringify(entries, null, 2) + "\\n");
const usage = () => "Usage: reading-list <add <title> [--tag <tag>...]|list [--tag <tag>]|read <id>>";

export function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  const entries = load();
  if (command === "add") {
    const titleParts = [];
    const tags = [];
    for (let index = 0; index < rest.length; index += 1) {
      if (rest[index] !== "--tag") {
        titleParts.push(rest[index]);
        continue;
      }
      if (index + 1 >= rest.length || rest[index + 1] === "--tag") throw new Error(usage());
      tags.push(rest[index + 1]);
      index += 1;
    }
    if (titleParts.length === 0) throw new Error(usage());
    const updated = addEntry(entries, titleParts.join(" "), tags);
    save(updated);
    return "Added " + updated.at(-1).id;
  }
  if (command === "list" && (rest.length === 0 || (rest.length === 2 && rest[0] === "--tag"))) {
    const listed = rest.length === 2 ? filterByTag(entries, rest[1]) : entries;
    return listed.map(formatEntry).join("\\n");
  }
  if (command === "read" && rest.length === 1) {
    save(markRead(entries, rest[0]));
    return "Marked " + rest[0] + " read";
  }
  throw new Error(usage());
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  try { process.stdout.write(main() + "\\n"); }
  catch (error) { process.stderr.write(error.message + "\\n"); process.exitCode = 1; }
}
`;
  const approvedProduct = `# Product brief
## Target user
Terminal readers who want a small local list.
## Core problem
Capturing and finishing a reading list should not require a hosted service.
## Current alternative
Ad hoc notes with inconsistent structure.
## Value proposition
Reliable dependency-free local capture from a terminal.
## MVP hypothesis
Fast add, list, and read commands are sufficient for the core workflow.
## Core user journeys
Add, list, filter, and finish a book.
## Non-goals
No hosted sync.
## Success criteria
Commands remain deterministic.
## Product principles and constraints
Remain dependency-free and preserve local data semantics.
`;
  const specProposal = `---
title: Search reading-list titles
status: draft
issue: 102
created: 2026-09-08
---
# 002 — Search reading-list titles
## Problem
Find local titles.
## Goals / Non-goals
Case-insensitive local search; no network.
## Acceptance criteria
Search returns matching entries and rejects empty queries.
## Interfaces
CLI search command.
## Architecture boundaries
Pure matching in the library and IO in the CLI.
## Functional core
Immutable filtering.
## Data model
No schema change.
## Test plan
Focused unit and CLI tests.
## Risks
Unicode matching remains basic.
## Integration boundary
Human-owned integration.
`;
  const firstSummary = `<!-- plus-ultra:pr-review:summary -->
# Plus Ultra PR Review

## Status

⛔ Changes required — one or more blockers.

## Findings

### Important

- **missing-title-validation** — Empty titles can be stored; restore validation at src/library.mjs:5.

## Traceability

| Issue | Spec | Contract |
| --- | --- | --- |
| #101 | \`specs/001-tag-filtering.md\` (approved) | Contractual review |
`;
  const rereviewSummary = `<!-- plus-ultra:pr-review:summary -->
# Plus Ultra PR Review

## Status

✅ Ready — no findings or non-blocking findings.

The corrected remote head restores required title validation.

## Findings

No findings. The approved contract and corrected remote-head change were reviewed.

## Traceability

| Issue | Spec | Contract |
| --- | --- | --- |
| #101 | \`specs/001-tag-filtering.md\` (approved) | Contractual review |

## Resolutions from the previous review

- Empty titles are rejected again at the corrected remote head.

<!-- plus-ultra:pr-review:resolution missing-title-validation=resolved -->
`;
  return `#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
if (args[0] === "--version") { process.stdout.write("codex-cli 1.2.3\\n"); process.exit(0); }
if (args.join(" ") === "plugin marketplace list --json") {
  process.stdout.write(JSON.stringify({ marketplaces: [{ name: "plus-ultra-dev", root: process.env.FAKE_CODEX_MARKETPLACE_ROOT }] }) + "\\n");
  process.exit(0);
}
if (args.join(" ") === "plugin list --marketplace plus-ultra-dev --json") {
  process.stdout.write(JSON.stringify({ installed: [{ pluginId: "plus-ultra@plus-ultra-dev", installed: true, enabled: true }] }) + "\\n");
  process.exit(0);
}
const phase = process.env.PLUS_ULTRA_BENCHMARK_PHASE;
const turn = Number(process.env.PLUS_ULTRA_BENCHMARK_TURN);
const sample = Number(process.env.PLUS_ULTRA_BENCHMARK_SAMPLE);
const prompt = args.at(-1);
const protocol = prompt
  .split("\\n", 1)[0]
  .replace("Benchmark protocol: ", "")
  .replaceAll(String.fromCharCode(96), "")
  .replace(/\\.$/, "");
const expectedPhase = {
  "product-discovery-proposal-v1": "product-discovery",
  "product-discovery-approval-v1": "product-discovery",
  "spec-draft-proposal-v1": "spec-refinement",
  "spec-approval-v1": "spec-refinement",
  "fast-whitespace-tdd-v1": "fast-implementation",
  "standard-tag-filtering-tdd-v1": "standard-implementation",
  "pr-review-first-v1": "first-pr-review",
  "pr-review-rereview-v1": "pr-re-review",
}[protocol];
if (!expectedPhase || expectedPhase !== phase) {
  process.stderr.write("unknown or mismatched benchmark protocol\\n");
  process.exit(65);
}
appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify({ args, cwd: process.cwd(), phase, protocol, sample, turn }) + "\\n");
const gh = (ghArgs) => {
  const result = spawnSync("gh", ghArgs, { encoding: "utf8", env: process.env });
  if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(result.status ?? 9); }
  return result.stdout;
};
const metadataFields = "number,baseRefName,baseRefOid,headRefName,headRepository,state,url,headRefOid";
const reviewThreadsQuery = "query=query ReviewThreads { repository(owner: $owner, name: $name) { pullRequest(number: $number) { reviewThreads(first: 1, after: $cursor) { nodes { id isResolved comments(first: 20) { nodes { author { login } body path line originalLine diffSide } } } pageInfo { hasNextPage endCursor } } } } }";
function gatherReviewEvidence(headOid) {
  gh(["auth", "status"]);
  gh(["pr", "view", "17"]);
  gh(["pr", "view", "17", "--json", "closingIssuesReferences"]);
  gh(["pr", "view", "17", "--json", metadataFields]);
  gh(["issue", "view", "101", "--json", "number,title,body,labels"]);
  gh(["api", "repos/example/reading-list/contents/specs?ref=" + headOid]);
  gh(["api", "repos/example/reading-list/contents/specs/001-tag-filtering.md?ref=" + headOid]);
  gh(["api", "repos/example/reading-list/compare/cccccccccccccccccccccccccccccccccccccccc..." + headOid]);
  gh(["api", "repos/example/reading-list/pulls/17/files?per_page=100&page=1"]);
  const evidencePaths = phase === "pr-re-review"
    ? ["src/library.mjs", "src/format.mjs", "src/cli.mjs", "test/tag-filtering.test.mjs"]
    : ["src/library.mjs"];
  for (const path of evidencePaths) {
    gh(["api", "repos/example/reading-list/contents/" + path + "?ref=" + headOid]);
  }
  gh(["pr", "diff", "17"]);
  gh(["pr", "view", "17", "--json", metadataFields]);
  gh(["api", "user"]);
  let cursor;
  do {
    const threadArgs = ["api", "graphql", "-f", reviewThreadsQuery, "-F", "owner=example", "-F", "name=reading-list", "-F", "number=17"];
    if (cursor) threadArgs.push("-f", "cursor=" + cursor);
    const page = JSON.parse(gh(threadArgs)).data.repository.pullRequest.reviewThreads;
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  gh(["api", "--paginate", "repos/example/reading-list/issues/17/comments?per_page=100"]);
  gh(["pr", "view", "17", "--json", metadataFields]);
}
if (protocol === "product-discovery-proposal-v1") {
  if (existsSync("docs/product.md")) { process.stderr.write("product brief existed before approval\\n"); process.exit(66); }
} else if (protocol === "product-discovery-approval-v1") {
  if (existsSync("docs/product.md")) { process.stderr.write("product proposal was written early\\n"); process.exit(66); }
  mkdirSync("docs", { recursive: true });
  writeFileSync("docs/product.md", ${JSON.stringify(approvedProduct)});
} else if (protocol === "spec-draft-proposal-v1") {
  gh(["issue", "view", "102"]);
  mkdirSync("specs", { recursive: true });
  writeFileSync("specs/002-search-reading-list.md", ${JSON.stringify(specProposal)});
} else if (protocol === "spec-approval-v1") {
  writeFileSync("specs/002-search-reading-list.md", readFileSync("specs/002-search-reading-list.md", "utf8").replace("status: draft", "status: approved"));
} else if (protocol === "fast-whitespace-tdd-v1") {
  const testPath = "test/format.test.mjs";
  const testName = process.env.FAKE_CODEX_FAST_TEST_NAME ?? "normalizes all whitespace runs";
  appendFileSync(testPath, "\\ntest(" + JSON.stringify(testName) + ", () => {\\n  assert.equal(normalizeTitle(\\\"  The\\\\t Left\\\\nHand  \\\"), \\\"The Left Hand\\\");\\n});\\n");
  const sourcePath = "src/format.mjs";
  writeFileSync(sourcePath, readFileSync(sourcePath, "utf8").replace("/ {2,}/g", "/\\\\s+/g"));
} else if (protocol === "standard-tag-filtering-tdd-v1") {
  writeFileSync("test/tag-filtering.test.mjs", ${JSON.stringify(canonicalTagFilteringTestSource)});
  if (process.env.FAKE_CODEX_STANDARD_UPDATE_EXISTING_TESTS === "1") {
    appendFileSync("test/format.test.mjs", "\\ntest(\\\"keeps untagged output unchanged\\\", () => {\\n  assert.equal(formatEntry({ id: 1, title: \\\"Dune\\\", read: false }), \\\"[ ] 1 Dune\\\");\\n});\\n");
    appendFileSync("test/library.test.mjs", "\\ntest(\\\"normalizes tags on add\\\", () => {\\n  assert.deepEqual(addEntry([], \\\"Dune\\\", [\\\" SCI-FI \\\"])[0].tags, [\\\"sci-fi\\\"]);\\n});\\n");
  }
  const testEnvironment = { ...process.env };
  delete testEnvironment.NODE_TEST_CONTEXT;
  const red = spawnSync(process.execPath, ["--test", "test/tag-filtering.test.mjs"], { encoding: "utf8", env: testEnvironment });
  if (red.status === 0) { process.stderr.write("STANDARD regression was not RED before implementation\\n" + red.stdout + red.stderr); process.exit(67); }
  appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify({ event: "test_run", phase, stage: "red", status: "failed-as-expected" }) + "\\n");
  writeFileSync("src/library.mjs", ${JSON.stringify(taggedLibrary)});
  writeFileSync("src/format.mjs", ${JSON.stringify(taggedFormat)});
  writeFileSync("src/cli.mjs", ${JSON.stringify(taggedCli)});
  const focusedGreen = spawnSync(process.execPath, ["--test", "test/tag-filtering.test.mjs"], { encoding: "utf8", env: testEnvironment });
  if (focusedGreen.status !== 0) { process.stderr.write(focusedGreen.stdout + focusedGreen.stderr); process.exit(focusedGreen.status ?? 68); }
  appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify({ event: "test_run", phase, stage: "focused-green", status: "passed" }) + "\\n");
  const suiteGreen = spawnSync(process.execPath, ["--test"], { encoding: "utf8", env: testEnvironment });
  if (suiteGreen.status !== 0) { process.stderr.write(suiteGreen.stdout + suiteGreen.stderr); process.exit(suiteGreen.status ?? 69); }
  appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify({ event: "test_run", phase, stage: "suite-green", status: "passed" }) + "\\n");
  if (process.env.FAKE_CODEX_STANDARD_OUT_OF_SCOPE === "1") {
    appendFileSync("package.json", "\\n");
  }
} else if (protocol === "pr-review-first-v1") {
  const headOid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  gatherReviewEvidence(headOid);
  gh(["api", "repos/example/reading-list/pulls/17/comments", "--method", "POST", "-f", "body=<!-- plus-ultra:pr-review:inline -->\\nImportant: missing-title-validation — A whitespace-only title is stored because this added line bypasses validation. Restore the normalized-title guard before assigning an ID.", "-f", "commit_id=" + headOid, "-f", "path=src/library.mjs", "-F", "line=5", "-f", "side=RIGHT"]);
  gh(["api", "repos/example/reading-list/issues/17/comments", "--method", "POST", "-f", ${JSON.stringify(`body=${firstSummary}`)}]);
} else if (protocol === "pr-review-rereview-v1") {
  const headOid = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  gatherReviewEvidence(headOid);
  gh(["api", "graphql", "-f", "query=mutation ResolveReviewThread { resolveReviewThread(input: {threadId: $threadId}) { thread { isResolved } } }", "-F", "threadId=BENCHMARK_THREAD_1"]);
  gh(["api", "repos/example/reading-list/issues/comments/9001", "--method", "PATCH", "-f", ${JSON.stringify(`body=${rereviewSummary}`)}]);
}
if (!args.includes("resume")) process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: phase + "-" + sample }) + "\\n");
const responseText = protocol === "product-discovery-proposal-v1"
  ? ${JSON.stringify(approvedProduct)}
  : phase + " complete";
process.stdout.write(JSON.stringify({ type: "item.completed", item: { id: "message-" + turn, type: "agent_message", text: responseText } }) + "\\n");
process.stdout.write(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 100, cached_input_tokens: 25, output_tokens: 20, reasoning_output_tokens: 5 } }) + "\\n");
`;
}

function fakeGhSource() {
  return `#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
appendFileSync(process.env.PLUS_ULTRA_BENCHMARK_GH_LOG, JSON.stringify(args) + "\\n");
if (args.length === 1 && args[0] === "probe") {
  process.stdout.write("benchmark fake gh\\n");
  process.exit(0);
}
if (args[0] !== "delete-thread" || args.length !== 2) {
  process.stderr.write("unknown fake gh operation\\n");
  process.exit(8);
}
const state = JSON.parse(readFileSync(process.env.PLUS_ULTRA_BENCHMARK_GH_STATE, "utf8"));
if (!state.created_thread_ids.includes(args[1])) {
  process.stderr.write("refusing to delete an unrelated thread\\n");
  process.exit(9);
}
state.threads = state.threads.filter((id) => id !== args[1]);
writeFileSync(process.env.PLUS_ULTRA_BENCHMARK_GH_STATE, JSON.stringify(state));
`;
}

const temporaryBenchmarkRepositories = new Set();

function createBenchmarkRepository() {
  const root = mkdtempSync(join(tmpdir(), "plus-ultra-benchmark-test-"));
  temporaryBenchmarkRepositories.add(root);
  mkdirSync(join(root, "hooks"), { recursive: true });
  mkdirSync(join(root, "skills", "example"), { recursive: true });
  mkdirSync(join(root, "specs"), { recursive: true });
  mkdirSync(join(root, "benchmarks", "fixtures", "reading-list"), { recursive: true });
  mkdirSync(join(root, "benchmarks", "prompts"), { recursive: true });
  mkdirSync(join(root, "benchmarks", "fake-github"), { recursive: true });
  mkdirSync(join(root, ".codex-plugin"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), "/.context/\n");
  writeFileSync(join(root, "AGENTS.md"), "fixture agent instructions\n");
  writeFileSync(join(root, "hooks", "session-start.mjs"), "// visible session context\n");
  writeFileSync(join(root, "skills", "example", "SKILL.md"), "# Example skill\n");
  writeFileSync(join(root, "specs", "fixture.md"), "# Durable artifact\n");
  writeFileSync(join(root, "benchmarks", "fixtures", "reading-list", "README.md"), "fixture\n");
  writeJson(join(root, ".codex-plugin", "plugin.json"), { name: "plus-ultra", version: "0.0.0" });
  for (const [scenarioId, phases] of canonicalScenarios) {
    const phaseDefinitions = phases.map((phase) => {
      const firstPrompt = `${scenarioId}-${phase}-work.md`;
      const turns = [{ prompt: `benchmarks/prompts/${firstPrompt}` }];
      writeFileSync(
        join(root, "benchmarks", "prompts", firstPrompt),
        `WRITE_RESULT ${phase}\n`
      );
      if (["product-discovery", "spec-refinement"].includes(phase)) {
        const approvalPrompt = `${scenarioId}-${phase}-approval.md`;
        writeFileSync(
          join(root, "benchmarks", "prompts", approvalPrompt),
          "APPROVE_AND_RESUME CLEAN_CREATED_THREAD\n"
        );
        turns.push({ prompt: `benchmarks/prompts/${approvalPrompt}`, resume: true });
      }
      return {
        phase,
        turns,
        postconditions: [{ type: "file_contains", path: "result.txt", text: `${phase} complete` }],
      };
    });
    writeJson(join(root, "benchmarks", "scenarios", `${scenarioId}.json`), {
      schema_version: 1,
      id: scenarioId,
      fixture: "benchmarks/fixtures/reading-list",
      phases: phaseDefinitions,
    });
  }
  writeJson(join(root, "benchmarks", "fake-github", "state.json"), {
    created_thread_ids: ["benchmark-created"],
    threads: ["benchmark-created", "unrelated-thread"],
  });
  const gh = join(root, "benchmarks", "fake-github", "gh");
  writeFileSync(gh, fakeGhSource());
  chmodSync(gh, 0o755);
  const codex = join(root, "fake-codex");
  writeFileSync(codex, fakeCodexSource());
  chmodSync(codex, 0o755);

  runGit(root, ["init", "--initial-branch=main"]);
  runGit(root, ["config", "user.name", "Benchmark tests"]);
  runGit(root, ["config", "user.email", "benchmark@example.test"]);
  runGit(root, ["add", "--all"]);
  runGit(root, ["commit", "-m", "test: create benchmark fixture"]);
  refreshBenchmarkStage(root);
  return { root, codex, log: join(root, ".context", "fake-codex.jsonl") };
}

function createVersionedBenchmarkRepository() {
  const root = mkdtempSync(join(tmpdir(), "plus-ultra-versioned-benchmark-test-"));
  temporaryBenchmarkRepositories.add(root);
  mkdirSync(join(root, "hooks"), { recursive: true });
  mkdirSync(join(root, "skills", "example"), { recursive: true });
  mkdirSync(join(root, "specs"), { recursive: true });
  mkdirSync(join(root, ".codex-plugin"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), "/.context/\n");
  writeFileSync(join(root, "AGENTS.md"), "fixture agent instructions\n");
  writeFileSync(join(root, "hooks", "session-start.mjs"), "// visible session context\n");
  writeFileSync(join(root, "skills", "example", "SKILL.md"), "# Example skill\n");
  writeFileSync(join(root, "specs", "fixture.md"), "# Durable artifact\n");
  writeJson(join(root, ".codex-plugin", "plugin.json"), { name: "plus-ultra", version: "0.0.0" });
  cpSync(join(testRoot, "benchmarks"), join(root, "benchmarks"), { recursive: true });
  const codex = join(root, "fake-codex");
  writeFileSync(codex, versionedFakeCodexSource());
  chmodSync(codex, 0o755);

  runGit(root, ["init", "--initial-branch=main"]);
  runGit(root, ["config", "user.name", "Benchmark tests"]);
  runGit(root, ["config", "user.email", "benchmark@example.test"]);
  runGit(root, ["add", "--all"]);
  runGit(root, ["commit", "-m", "test: create versioned benchmark fixture"]);
  refreshBenchmarkStage(root);
  return { root, codex, log: join(root, ".context", "fake-codex.jsonl") };
}

test.after(() => {
  for (const root of temporaryBenchmarkRepositories) {
    rmSync(root, { recursive: true, force: true });
  }
});

function refreshBenchmarkStage(root) {
  const marketplace = join(root, ".context", "codex-dev-marketplace");
  const stage = join(marketplace, "plugins", "plus-ultra");
  mkdirSync(stage, { recursive: true });
  const paths = runGit(root, ["ls-files", "-z"]).split("\0").filter(Boolean);
  for (const path of paths) {
    const destination = join(stage, path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(root, path), destination);
  }
  writeJson(join(marketplace, ".agents", "plugins", "marketplace.json"), {
    name: "plus-ultra-dev",
    plugins: [{ name: "plus-ultra", source: { source: "url", url: "./plugins/plus-ultra" } }],
  });
}

function runBenchmarkCli(repository, args, extraEnv = {}) {
  mkdirSync(dirname(repository.log), { recursive: true });
  return spawnSync(process.execPath, [benchmarkCli, ...args], {
    cwd: repository.root,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_BIN: repository.codex,
      FAKE_CODEX_LOG: repository.log,
      FAKE_CODEX_MARKETPLACE_ROOT: join(repository.root, ".context", "codex-dev-marketplace"),
      PLUS_ULTRA_BENCHMARK_RUN_ID: "integration-run",
      ...extraEnv,
    },
  });
}

function cliJson(result) {
  assert.notEqual(result.stdout.trim(), "", result.stderr);
  return JSON.parse(result.stdout);
}

test("benchmark CLI validates immutable inputs and inventories ranked contributors", () => {
  const repository = createBenchmarkRepository();

  const validation = runBenchmarkCli(repository, ["validate"]);
  assert.equal(validation.status, 0, validation.stderr);
  assert.equal(cliJson(validation).scenario_count, 5);
  assert.deepEqual(cliJson(validation).phases, [
    "product-discovery",
    "spec-refinement",
    "fast-implementation",
    "standard-implementation",
    "first-pr-review",
    "pr-re-review",
  ]);

  const inventory = runBenchmarkCli(repository, ["inventory"]);
  assert.equal(inventory.status, 0, inventory.stderr);
  const contributors = cliJson(inventory).contributors;
  assert.deepEqual(
    [...contributors].sort((left, right) => right.bytes - left.bytes || left.name.localeCompare(right.name)),
    contributors
  );
  assert.deepEqual(
    new Set(contributors.map(({ name }) => name)),
    new Set([
      "AGENTS.md",
      "session-start injection",
      "invoked skill bodies",
      "durable artifacts",
      "prompts",
      "tool payloads",
      "verification/review outputs",
    ])
  );
});

test("validate refuses dirty source trees and stale managed development stages", () => {
  const repository = createBenchmarkRepository();
  writeFileSync(join(repository.root, "AGENTS.md"), "dirty\n");

  const dirty = runBenchmarkCli(repository, ["validate"]);
  assert.equal(dirty.status, 1);
  assert.match(dirty.stderr, /clean source tree/i);

  runGit(repository.root, ["add", "AGENTS.md"]);
  runGit(repository.root, ["commit", "-m", "test: change tracked source"]);
  const stale = runBenchmarkCli(repository, ["validate"]);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /codex-local\.mjs refresh/i);
});

test("validate requires Codex to have the managed development snapshot installed", () => {
  const repository = createBenchmarkRepository();

  const validation = runBenchmarkCli(repository, ["validate"], {
    FAKE_CODEX_MARKETPLACE_ROOT: join(repository.root, ".context", "foreign-marketplace"),
  });

  assert.equal(validation.status, 1);
  assert.match(validation.stderr, /plus-ultra-dev.*codex-local\.mjs refresh/i);
});

test("validate rejects extra files left in a stale managed plugin tree", () => {
  const repository = createBenchmarkRepository();
  writeFileSync(
    join(
      repository.root,
      ".context",
      "codex-dev-marketplace",
      "plugins",
      "plus-ultra",
      "removed-source-file.md"
    ),
    "stale\n"
  );

  const validation = runBenchmarkCli(repository, ["validate"]);

  assert.equal(validation.status, 1);
  assert.match(validation.stderr, /does not match source.*codex-local\.mjs refresh/i);
});

test("validate rejects a non-executable fake gh before PATH can fall through", () => {
  const repository = createBenchmarkRepository();
  const fakeGh = join(repository.root, "benchmarks", "fake-github", "gh");
  chmodSync(fakeGh, 0o644);
  runGit(repository.root, ["add", "benchmarks/fake-github/gh"]);
  runGit(repository.root, ["commit", "-m", "test: make fake gh non-executable"]);
  refreshBenchmarkStage(repository.root);

  const fallbackDirectory = join(repository.root, ".context", "fallback-bin");
  const fallbackGh = join(fallbackDirectory, "gh");
  const marker = join(repository.root, ".context", "real-gh-was-called");
  mkdirSync(fallbackDirectory, { recursive: true });
  writeFileSync(fallbackGh, '#!/bin/sh\nprintf reached > "$FALLBACK_GH_MARKER"\n');
  chmodSync(fallbackGh, 0o755);

  const run = runBenchmarkCli(
    repository,
    ["run", "--model", "gpt-test", "--reasoning", "medium", "--scenario", "product-discovery"],
    {
      FALLBACK_GH_MARKER: marker,
      PATH: `${fallbackDirectory}:${process.env.PATH}`,
    }
  );

  assert.equal(run.status, 1);
  assert.match(run.stderr, /fake gh.*executable/i);
  assert.equal(existsSync(marker), false);
});

test("validate rejects canonical phases assigned to the wrong scenarios", () => {
  const repository = createBenchmarkRepository();
  const manifests = canonicalScenarios.map(([id]) => {
    const path = join(repository.root, "benchmarks", "scenarios", `${id}.json`);
    return { path, value: JSON.parse(readFileSync(path, "utf8")) };
  });
  const phases = manifests.flatMap(({ value }) => value.phases);
  const wrongOwnership = [[phases[0], phases[1]], [phases[2]], [phases[3]], [phases[4]], [phases[5]]];
  for (let index = 0; index < manifests.length; index += 1) {
    writeJson(manifests[index].path, { ...manifests[index].value, phases: wrongOwnership[index] });
  }
  runGit(repository.root, ["add", "benchmarks/scenarios"]);
  runGit(repository.root, ["commit", "-m", "test: misassign benchmark phases"]);
  refreshBenchmarkStage(repository.root);

  const validation = runBenchmarkCli(repository, ["validate"]);

  assert.equal(validation.status, 1);
  assert.match(validation.stderr, /phase ownership/i);
});

test("run resumes approval turns, isolates clones, cleans exact fake threads, and adds an adaptive third sample", () => {
  const repository = createBenchmarkRepository();

  const run = runBenchmarkCli(
    repository,
    ["run", "--model", "gpt-test", "--reasoning", "medium", "--scenario", "product-discovery"],
    { FAKE_CODEX_ADAPTIVE_PHASE: "product-discovery" }
  );
  assert.equal(run.status, 0, run.stderr);
  const output = cliJson(run);
  const summary = JSON.parse(readFileSync(output.summary, "utf8"));
  const phase = summary.phases.find(({ phase: name }) => name === "product-discovery");
  assert.equal(phase.samples.length, 3);
  const runDirectory = dirname(output.summary);
  const invocations = readFileSync(repository.log, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(invocations.length, 6);
  for (let index = 0; index < invocations.length; index += 2) {
    const initial = invocations[index];
    const resumed = invocations[index + 1];
    assert.equal(initial.args.includes("resume"), false);
    assert.equal(resumed.args.includes("resume"), true);
    assert.equal(resumed.args.includes(`product-discovery-sample-${initial.sample}`), true);
    assert.notEqual(initial.cwd, repository.root);
    assert.equal(dirname(initial.cwd), runDirectory);
    assert.equal(
      basename(initial.cwd).startsWith(
        `temporary-product-discovery-product-discovery-${initial.sample}-`
      ),
      true
    );
    assert.deepEqual(initial.args.slice(0, 8), [
      "exec",
      "--json",
      "--model",
      "gpt-test",
      "--config",
      'model_reasoning_effort="medium"',
      "--sandbox",
      "workspace-write",
    ]);
  }
  const sampleDirs = readdirSync(join(dirname(output.summary), "scenarios", "product-discovery"));
  assert.equal(sampleDirs.length, 3);
  for (const sampleDir of sampleDirs) {
    const state = JSON.parse(
      readFileSync(
        join(dirname(output.summary), "scenarios", "product-discovery", sampleDir, "fake-github-state.json"),
        "utf8"
      )
    );
    assert.deepEqual(state.threads, ["unrelated-thread"]);
  }
});

test("run pins fake gh across login shells and prevents state redirection", () => {
  const repository = createBenchmarkRepository();
  const hostileHome = join(repository.root, ".context", "hostile-home");
  const fallbackBin = join(hostileHome, "bin");
  const fallbackMarker = join(repository.root, ".context", "fallback-gh-called");
  mkdirSync(fallbackBin, { recursive: true });
  const fallbackGh = join(fallbackBin, "gh");
  writeFileSync(
    fallbackGh,
    `#!/bin/sh\nprintf reached > ${JSON.stringify(fallbackMarker)}\nexit 0\n`
  );
  chmodSync(fallbackGh, 0o755);
  for (const profile of [".zshenv", ".zprofile", ".bash_profile", ".profile"]) {
    writeFileSync(join(hostileHome, profile), `export PATH=${JSON.stringify(fallbackBin)}\n`);
  }

  const run = runBenchmarkCli(
    repository,
    ["run", "--model", "gpt-test", "--reasoning", "medium", "--scenario", "fast-implementation"],
    {
      CODEX_HOME: join(repository.root, ".context", "original-codex-home"),
      FAKE_CODEX_SHELL_PROBE_PHASE: "fast-implementation",
      HOME: hostileHome,
      ZDOTDIR: hostileHome,
    }
  );

  assert.equal(run.status, 0, run.stderr);
  assert.equal(existsSync(fallbackMarker), false);
  const output = cliJson(run);
  const records = readFileSync(repository.log, "utf8").trim().split("\n").map(JSON.parse);
  const invocations = records.filter(({ args }) => args);
  const probes = records.filter(({ event }) => event === "shell_probe");
  const availableShells = ["/bin/zsh", "/bin/bash", "/bin/sh"].filter(existsSync);
  assert.equal(
    invocations.every(
      ({ codex_home, home, zdotdir }) =>
        codex_home === join(repository.root, ".context", "original-codex-home") &&
        home.includes("/.plus-ultra-benchmark/home") &&
        zdotdir.includes("/.plus-ultra-benchmark/zsh")
    ),
    true
  );
  assert.equal(probes.length, invocations.length * availableShells.length);
  assert.deepEqual(
    [...new Set(probes.map(({ shell }) => shell))].sort(),
    availableShells.sort()
  );
  assert.equal(
    probes.every(
      ({ locate_status, invoke_status }) => locate_status === 0 && invoke_status === 0
    ),
    true
  );
  assert.equal(
    probes.every(({ resolved }) => resolved.includes("/.plus-ultra-benchmark/bin/gh")),
    true
  );
  const sampleRoot = join(dirname(output.summary), "scenarios", "fast-implementation");
  for (const sample of readdirSync(sampleRoot)) {
    const directory = join(sampleRoot, sample);
    assert.equal(existsSync(join(directory, "failed-repository")), false);
    assert.equal(existsSync(join(directory, "redirected-gh.jsonl")), false);
    const audit = readFileSync(join(directory, "fake-github.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse);
    assert.equal(
      audit.filter(([operation]) => operation === "probe").length,
      availableShells.length
    );
  }
});

test("run ignores only the exact lifecycle marker path during scope checks", () => {
  const markerOnly = createBenchmarkRepository();
  const manifestPath = join(
    markerOnly.root,
    "benchmarks",
    "scenarios",
    "fast-implementation.json"
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.workflow = {
    risk: "FAST",
    allowed_changes: ["result.txt"],
    required_changes: ["result.txt"],
  };
  writeJson(manifestPath, manifest);
  runGit(markerOnly.root, ["add", "benchmarks/scenarios/fast-implementation.json"]);
  runGit(markerOnly.root, ["commit", "-m", "test: constrain marker fixture"]);
  refreshBenchmarkStage(markerOnly.root);

  const accepted = runBenchmarkCli(
    markerOnly,
    ["run", "--model", "gpt-test", "--reasoning", "medium", "--scenario", "fast-implementation"],
    { FAKE_CODEX_MARKER_PHASE: "fast-implementation" }
  );
  assert.equal(accepted.status, 0, accepted.stderr);

  const arbitrary = createBenchmarkRepository();
  const arbitraryManifestPath = join(
    arbitrary.root,
    "benchmarks",
    "scenarios",
    "fast-implementation.json"
  );
  writeJson(arbitraryManifestPath, manifest);
  runGit(arbitrary.root, ["add", "benchmarks/scenarios/fast-implementation.json"]);
  runGit(arbitrary.root, ["commit", "-m", "test: constrain arbitrary fixture"]);
  refreshBenchmarkStage(arbitrary.root);
  const rejected = runBenchmarkCli(
    arbitrary,
    ["run", "--model", "gpt-test", "--reasoning", "medium", "--scenario", "fast-implementation"],
    {
      FAKE_CODEX_ARBITRARY_CODEX_PHASE: "fast-implementation",
      FAKE_CODEX_MARKER_PHASE: "fast-implementation",
    }
  );
  assert.equal(rejected.status, 1);
  const rejectedSummary = JSON.parse(readFileSync(cliJson(rejected).summary, "utf8"));
  assert.match(rejectedSummary.phases[0].samples[0].error, /\.codex\/unexpected\.txt/);
  assert.doesNotMatch(rejectedSummary.phases[0].samples[0].error, /plus-ultra\/state/);
});

test("adaptive sampling adds a third run only to the variable phase", () => {
  const repository = createBenchmarkRepository();

  const run = runBenchmarkCli(
    repository,
    ["run", "--model", "gpt-test", "--reasoning", "medium", "--scenario", "pr-review-cycle"],
    { FAKE_CODEX_ADAPTIVE_PHASE: "pr-re-review" }
  );

  assert.equal(run.status, 0, run.stderr);
  const summary = JSON.parse(readFileSync(cliJson(run).summary, "utf8"));
  assert.equal(
    summary.phases.find(({ phase }) => phase === "first-pr-review").samples.length,
    2
  );
  assert.equal(
    summary.phases.find(({ phase }) => phase === "pr-re-review").samples.length,
    3
  );
});

test("run remains incomplete when a required adaptive third sample fails", () => {
  const repository = createBenchmarkRepository();

  const run = runBenchmarkCli(
    repository,
    ["run", "--model", "gpt-test", "--reasoning", "medium", "--scenario", "fast-implementation"],
    {
      FAKE_CODEX_ADAPTIVE_PHASE: "fast-implementation",
      FAKE_CODEX_FAIL_PHASE: "fast-implementation",
      FAKE_CODEX_FAIL_SAMPLE: "3",
    }
  );

  assert.equal(run.status, 1);
  const summary = JSON.parse(readFileSync(cliJson(run).summary, "utf8"));
  assert.equal(summary.status, "incomplete");
  assert.equal(summary.executed_scenarios[0].status, "failed");
  assert.equal(
    summary.phases.find(({ phase }) => phase === "fast-implementation").samples[2].status,
    "failed"
  );
});

test("scenario recovery replaces only the failed scenario and archives its raw artifacts", () => {
  const repository = createBenchmarkRepository();
  const initial = runBenchmarkCli(
    repository,
    ["run", "--model", "gpt-test", "--reasoning", "medium"],
    { FAKE_CODEX_FAIL_PHASE: "first-pr-review" }
  );
  assert.equal(initial.status, 1);
  const initialOutput = cliJson(initial);
  const initialSummary = JSON.parse(readFileSync(initialOutput.summary, "utf8"));
  const preservedPhases = JSON.stringify(initialSummary.phases.slice(0, 4));
  const preservedHashes = JSON.stringify(initialSummary.hashes);
  const failedScenario = join(
    dirname(initialOutput.summary),
    "scenarios",
    "pr-review-cycle"
  );
  assert.equal(existsSync(failedScenario), true);

  const failedRecovery = runBenchmarkCli(
    repository,
    [
      "run",
      "--model",
      "gpt-test",
      "--reasoning",
      "medium",
      "--scenario",
      "pr-review-cycle",
    ],
    { FAKE_CODEX_FAIL_PHASE: "first-pr-review" }
  );
  assert.equal(failedRecovery.status, 1);
  assert.equal(cliJson(failedRecovery).summary, initialOutput.summary);
  const firstArchive = join(
    dirname(initialOutput.summary),
    "attempts",
    "pr-review-cycle-attempt-1"
  );
  assert.equal(
    existsSync(join(firstArchive, "first-pr-review-sample-1", "failed-repository")),
    true
  );

  const recovered = runBenchmarkCli(repository, [
    "run",
    "--model",
    "gpt-test",
    "--reasoning",
    "medium",
    "--scenario",
    "pr-review-cycle",
  ]);
  assert.equal(recovered.status, 0, recovered.stderr);
  const recoveredOutput = cliJson(recovered);
  assert.equal(recoveredOutput.summary, initialOutput.summary);
  const recoveredSummary = JSON.parse(readFileSync(recoveredOutput.summary, "utf8"));
  assert.equal(recoveredSummary.status, "complete");
  assert.equal(JSON.stringify(recoveredSummary.phases.slice(0, 4)), preservedPhases);
  assert.equal(JSON.stringify(recoveredSummary.hashes), preservedHashes);
  assert.equal(existsSync(firstArchive), true);
  assert.equal(
    existsSync(
      join(
        dirname(initialOutput.summary),
        "attempts",
        "pr-review-cycle-attempt-2",
        "first-pr-review-sample-1",
        "failed-repository"
      )
    ),
    true
  );
  assert.equal(
    recoveredSummary.phases
      .slice(4)
      .every(({ samples }) => samples.every(({ status }) => status === "success")),
    true
  );
});

test("scenario recovery refuses complete, drifted, and malformed existing runs", () => {
  const completeRepository = createBenchmarkRepository();
  const complete = runBenchmarkCli(completeRepository, [
    "run",
    "--model",
    "gpt-test",
    "--reasoning",
    "medium",
  ]);
  assert.equal(complete.status, 0, complete.stderr);
  const completeRecovery = runBenchmarkCli(completeRepository, [
    "run",
    "--model",
    "gpt-test",
    "--reasoning",
    "medium",
    "--scenario",
    "fast-implementation",
  ]);
  assert.equal(completeRecovery.status, 1);
  assert.match(completeRecovery.stderr, /complete run/i);

  const driftedRepository = createBenchmarkRepository();
  const drifted = runBenchmarkCli(
    driftedRepository,
    ["run", "--model", "gpt-test", "--reasoning", "medium"],
    { FAKE_CODEX_FAIL_PHASE: "first-pr-review" }
  );
  assert.equal(drifted.status, 1);
  const profileMismatch = runBenchmarkCli(driftedRepository, [
    "run",
    "--model",
    "gpt-test",
    "--reasoning",
    "high",
    "--scenario",
    "pr-review-cycle",
  ]);
  assert.equal(profileMismatch.status, 1);
  assert.match(profileMismatch.stderr, /identity drift.*reasoning_effort/i);
  writeFileSync(join(driftedRepository.root, "AGENTS.md"), "changed benchmark context\n");
  runGit(driftedRepository.root, ["add", "AGENTS.md"]);
  runGit(driftedRepository.root, ["commit", "-m", "test: drift benchmark identity"]);
  refreshBenchmarkStage(driftedRepository.root);
  const driftedRecovery = runBenchmarkCli(driftedRepository, [
    "run",
    "--model",
    "gpt-test",
    "--reasoning",
    "medium",
    "--scenario",
    "pr-review-cycle",
  ]);
  assert.equal(driftedRecovery.status, 1);
  assert.match(driftedRecovery.stderr, /identity drift.*git_tree/i);
  assert.equal(
    existsSync(
      join(
        dirname(cliJson(drifted).summary),
        "attempts",
        "pr-review-cycle-attempt-1"
      )
    ),
    false
  );

  const malformedRepository = createBenchmarkRepository();
  const malformed = runBenchmarkCli(
    malformedRepository,
    ["run", "--model", "gpt-test", "--reasoning", "medium"],
    { FAKE_CODEX_FAIL_PHASE: "first-pr-review" }
  );
  assert.equal(malformed.status, 1);
  const malformedOutput = cliJson(malformed);
  const malformedSummary = JSON.parse(readFileSync(malformedOutput.summary, "utf8"));
  malformedSummary.phases.shift();
  writeJson(malformedOutput.summary, malformedSummary);
  const malformedRecovery = runBenchmarkCli(malformedRepository, [
    "run",
    "--model",
    "gpt-test",
    "--reasoning",
    "medium",
    "--scenario",
    "pr-review-cycle",
  ]);
  assert.equal(malformedRecovery.status, 1);
  assert.match(malformedRecovery.stderr, /all six canonical phases/i);
});

test("run retains failed repositories and continues with unrelated scenarios", () => {
  const repository = createBenchmarkRepository();

  const run = runBenchmarkCli(
    repository,
    ["run", "--model", "gpt-test", "--reasoning", "medium"],
    { FAKE_CODEX_FAIL_PHASE: "fast-implementation" }
  );
  assert.equal(run.status, 1);
  const output = cliJson(run);
  const summary = JSON.parse(readFileSync(output.summary, "utf8"));
  assert.equal(summary.status, "incomplete");
  assert.equal(
    summary.phases.find(({ phase }) => phase === "fast-implementation").samples[0].status,
    "failed"
  );
  assert.equal(
    summary.phases.find(({ phase }) => phase === "standard-implementation").samples.length,
    2
  );
  const failed = summary.phases
    .flatMap(({ samples }) => samples)
    .find(({ status }) => status === "failed");
  assert.equal(failed.repository.startsWith(dirname(output.summary)), true);
  assert.equal(existsSync(failed.repository), true);
  assert.equal(existsSync(join(failed.repository, "result.txt")), true);
});

test("run converts a throwing process port into a retained failure and continues", () => {
  const repository = createBenchmarkRepository();
  let thrown = false;
  const runProcess = (executable, args, options) => {
    if (
      !thrown &&
      options.env.PLUS_ULTRA_BENCHMARK_PHASE === "fast-implementation" &&
      options.env.PLUS_ULTRA_BENCHMARK_SAMPLE === "1"
    ) {
      thrown = true;
      throw Object.assign(new Error("spawnSync ENOBUFS"), {
        stdout: `${JSON.stringify({ type: "thread.started", thread_id: "partial-thread" })}\n`,
        stderr: "partial process stderr\n",
      });
    }
    return spawnSync(executable, args, {
      cwd: options.cwd,
      env: options.env,
      encoding: "utf8",
      input: options.input,
      maxBuffer: 64 * 1024 * 1024,
    });
  };

  const output = runBenchmark({
    root: repository.root,
    model: "gpt-test",
    reasoning: "medium",
    environment: {
      ...process.env,
      CODEX_BIN: repository.codex,
      FAKE_CODEX_LOG: repository.log,
      FAKE_CODEX_MARKETPLACE_ROOT: join(
        repository.root,
        ".context",
        "codex-dev-marketplace"
      ),
      PLUS_ULTRA_BENCHMARK_RUN_ID: "throwing-process-port",
    },
    runProcess,
  });

  assert.equal(output.summary.status, "incomplete");
  const failed = output.summary.phases
    .find(({ phase }) => phase === "fast-implementation")
    .samples[0];
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /ENOBUFS/);
  assert.equal(existsSync(failed.repository), true);
  assert.match(readFileSync(failed.raw_jsonl, "utf8"), /partial-thread/);
  assert.match(readFileSync(join(dirname(failed.raw_jsonl), "fast-implementation.stderr.txt"), "utf8"), /partial process stderr/);
  assert.equal(
    output.summary.phases.find(({ phase }) => phase === "standard-implementation").samples.length,
    2
  );
  assert.equal(existsSync(output.summaryPath), true);
});

test("record refuses an incomplete scenario run", () => {
  const repository = createBenchmarkRepository();
  const run = runBenchmarkCli(repository, [
    "run",
    "--model",
    "gpt-test",
    "--reasoning",
    "medium",
    "--scenario",
    "fast-implementation",
  ]);
  assert.equal(run.status, 0, run.stderr);
  const output = cliJson(run);

  const record = runBenchmarkCli(repository, [
    "record",
    "--run",
    output.summary,
    "--baseline",
    join(repository.root, "baseline.json"),
  ]);
  assert.equal(record.status, 1);
  assert.match(record.stderr, /all five scenarios|six phase/i);
  assert.equal(existsSync(join(repository.root, "baseline.json")), false);
});

test("record refuses a run missing its required adaptive third sample", () => {
  const repository = createBenchmarkRepository();
  const run = runBenchmarkCli(
    repository,
    ["run", "--model", "gpt-test", "--reasoning", "medium"],
    { FAKE_CODEX_ADAPTIVE_PHASE: "fast-implementation" }
  );
  assert.equal(run.status, 0, run.stderr);
  const output = cliJson(run);
  const summary = JSON.parse(readFileSync(output.summary, "utf8"));
  summary.phases.find(({ phase }) => phase === "fast-implementation").samples.pop();
  writeJson(output.summary, summary);

  const record = runBenchmarkCli(repository, [
    "record",
    "--run",
    output.summary,
    "--baseline",
    join(repository.root, ".context", "incomplete-adaptive.json"),
  ]);

  assert.equal(record.status, 1);
  assert.match(record.stderr, /third sample/i);
});

test("record writes a complete allow-listed baseline without transient run content", () => {
  const repository = createBenchmarkRepository();
  const run = runBenchmarkCli(repository, ["run", "--model", "gpt-test", "--reasoning", "medium"]);
  assert.equal(run.status, 0, run.stderr);
  const output = cliJson(run);
  const baselinePath = join(repository.root, ".context", "recorded-baseline.json");

  const record = runBenchmarkCli(repository, [
    "record",
    "--run",
    output.summary,
    "--baseline",
    baselinePath,
  ]);
  assert.equal(record.status, 0, record.stderr);
  const recorded = readFileSync(baselinePath, "utf8");
  for (const forbidden of [
    "WRITE_RESULT",
    "APPROVE_AND_RESUME",
    "model response",
    "command_output",
    "stderr",
    "thread_id",
    "integration-run",
    repository.root,
    "/private/secret",
  ]) {
    assert.equal(recorded.includes(forbidden), false, forbidden);
  }
  const value = JSON.parse(recorded);
  assert.equal(value.phases.length, 6);
  assert.equal(Object.hasOwn(value.phases[0], "samples"), false);
});

test("record recomputes aggregates and budgets from successful samples", () => {
  const repository = createBenchmarkRepository();
  const run = runBenchmarkCli(repository, ["run", "--model", "gpt-test", "--reasoning", "medium"]);
  assert.equal(run.status, 0, run.stderr);
  const output = cliJson(run);
  const summary = JSON.parse(readFileSync(output.summary, "utf8"));
  const phase = summary.phases.find(({ phase }) => phase === "fast-implementation");
  phase.aggregate.input_tokens.value = 999_999;
  summary.budgets["fast-implementation"].input_tokens = 1;
  writeJson(output.summary, summary);
  const baselinePath = join(repository.root, ".context", "recomputed-baseline.json");

  const record = runBenchmarkCli(repository, [
    "record",
    "--run",
    output.summary,
    "--baseline",
    baselinePath,
  ]);

  assert.equal(record.status, 0, record.stderr);
  const recorded = JSON.parse(readFileSync(baselinePath, "utf8"));
  const recordedPhase = recorded.phases.find(({ phase }) => phase === "fast-implementation");
  assert.equal(recordedPhase.aggregate.input_tokens.value, 100);
  assert.equal(recorded.budgets["fast-implementation"].input_tokens, 1000);
});

test("record rejects extra successful or failed sample attempts", () => {
  const repository = createBenchmarkRepository();
  const run = runBenchmarkCli(
    repository,
    ["run", "--model", "gpt-test", "--reasoning", "medium"],
    { FAKE_CODEX_ADAPTIVE_PHASE: "fast-implementation" }
  );
  assert.equal(run.status, 0, run.stderr);
  const output = cliJson(run);
  const original = JSON.parse(readFileSync(output.summary, "utf8"));

  const extraSuccess = structuredClone(original);
  const adaptivePhase = extraSuccess.phases.find(
    ({ phase }) => phase === "fast-implementation"
  );
  adaptivePhase.samples.push({ ...structuredClone(adaptivePhase.samples[2]), sample: 4 });
  const extraSuccessPath = join(repository.root, ".context", "extra-success-summary.json");
  writeJson(extraSuccessPath, extraSuccess);

  const extraFailure = structuredClone(original);
  extraFailure.phases
    .find(({ phase }) => phase === "product-discovery")
    .samples.push({ status: "failed", sample: 3, error: "unexpected retry" });
  const extraFailurePath = join(repository.root, ".context", "extra-failure-summary.json");
  writeJson(extraFailurePath, extraFailure);

  const extraSuccessRecord = runBenchmarkCli(repository, [
    "record",
    "--run",
    extraSuccessPath,
    "--baseline",
    join(repository.root, ".context", "extra-success-baseline.json"),
  ]);
  const extraFailureRecord = runBenchmarkCli(repository, [
    "record",
    "--run",
    extraFailurePath,
    "--baseline",
    join(repository.root, ".context", "extra-failure-baseline.json"),
  ]);

  assert.equal(extraSuccessRecord.status, 1);
  assert.match(extraSuccessRecord.stderr, /exactly three successful samples/i);
  assert.equal(extraFailureRecord.status, 1);
  assert.match(extraFailureRecord.stderr, /failed sample attempts/i);
});

test("compare reports metric deltas, budget status, and environment drift without gating", () => {
  const repository = createBenchmarkRepository();
  const baselinePath = join(repository.root, ".context", "baseline.json");
  const candidatePath = join(repository.root, ".context", "candidate.json");
  writeJson(baselinePath, baseline());
  const candidate = baseline({
    phases: [
      {
        phase: "fast-implementation",
        aggregate: sample({ input_tokens: exact(1500), elapsed_ms: observed(700) }),
      },
    ],
    environment: {
      codex_version: "1.2.3",
      operating_system: "linux",
      architecture: "x64",
    },
  });
  writeJson(candidatePath, candidate);

  const comparison = runBenchmarkCli(repository, [
    "compare",
    "--baseline",
    baselinePath,
    "--candidate",
    candidatePath,
  ]);
  assert.equal(comparison.status, 0, comparison.stderr);
  const output = cliJson(comparison);
  const input = output.phases[0].metrics.input_tokens;
  const elapsed = output.phases[0].metrics.elapsed_ms;
  assert.deepEqual(input, { comparable: true, baseline: 100, candidate: 1500, delta: 1400, budget: 1000, status: "over" });
  assert.equal(elapsed.comparable, false);
  assert.deepEqual(elapsed.drift, ["operating_system", "architecture"]);
});

function repositoryScenarioManifests() {
  const directory = join(testRoot, "benchmarks", "scenarios");
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(directory, name), "utf8")));
}

function fixedFixtureCommit(repository) {
  const environment = {
    ...process.env,
    GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
  };
  const execute = (args) => {
    const result = spawnSync("git", ["-C", repository, ...args], {
      encoding: "utf8",
      env: environment,
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  execute(["init", "--initial-branch=main"]);
  execute(["config", "user.name", "Plus Ultra benchmark"]);
  execute(["config", "user.email", "benchmark@plus-ultra.local"]);
  execute(["add", "--all"]);
  execute(["commit", "-m", "chore: initialize benchmark fixture"]);
  return execute(["rev-parse", "HEAD"]);
}

test("versioned benchmark suite owns exactly five scenarios and six canonical phases", () => {
  const manifests = repositoryScenarioManifests();
  const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));

  assert.equal(manifests.length, 5);
  assert.deepEqual([...byId.keys()].sort(), canonicalScenarios.map(([id]) => id).sort());
  assert.deepEqual(
    canonicalScenarios.flatMap(([id]) => byId.get(id).phases.map(({ phase }) => [id, phase])),
    [
      ["product-discovery", "product-discovery"],
      ["spec-refinement", "spec-refinement"],
      ["fast-implementation", "fast-implementation"],
      ["standard-implementation", "standard-implementation"],
      ["pr-review-cycle", "first-pr-review"],
      ["pr-review-cycle", "pr-re-review"],
    ]
  );
  for (const manifest of manifests) {
    assert.equal(manifest.schema_version, 1);
    assert.equal(manifest.fixture, "benchmarks/fixtures/reading-list");
    assert.equal(manifest.phases.length, canonicalScenarios.find(([id]) => id === manifest.id)[1].length);
  }
});

test("reading-list fixture is dependency-free, initially green, and produces deterministic history", () => {
  const fixture = join(testRoot, "benchmarks", "fixtures", "reading-list");
  const packageManifest = JSON.parse(readFileSync(join(fixture, "package.json"), "utf8"));

  assert.equal(packageManifest.type, "module");
  assert.deepEqual(packageManifest.dependencies ?? {}, {});
  assert.deepEqual(packageManifest.devDependencies ?? {}, {});
  assert.equal(statSync(join(fixture, "src", "cli.mjs")).isFile(), true);
  assert.equal(statSync(join(fixture, "src", "library.mjs")).isFile(), true);
  assert.equal(statSync(join(fixture, "scripts", "check-postcondition.mjs")).isFile(), true);

  const tests = spawnSync(process.execPath, ["--test"], { cwd: fixture, encoding: "utf8" });
  assert.equal(tests.status, 0, tests.stderr || tests.stdout);

  const first = mkdtempSync(join(tmpdir(), "reading-list-history-a-"));
  const second = mkdtempSync(join(tmpdir(), "reading-list-history-b-"));
  temporaryBenchmarkRepositories.add(first);
  temporaryBenchmarkRepositories.add(second);
  cpSync(fixture, first, { recursive: true });
  cpSync(fixture, second, { recursive: true });
  assert.equal(fixedFixtureCommit(first), fixedFixtureCommit(second));
});

test("discovery scenarios require distinct proposal and explicit approval turns", () => {
  const manifests = new Map(repositoryScenarioManifests().map((manifest) => [manifest.id, manifest]));
  const assertApprovalTurns = (phase) => {
    assert.deepEqual(phase.turns.map(({ kind }) => kind), ["proposal", "approval"]);
    assert.equal(phase.turns[0].resume ?? false, false);
    assert.equal(phase.turns[1].resume, true);
    assert.equal(phase.turns[1].explicit_approval, true);
    assert.notEqual(phase.turns[0].prompt, phase.turns[1].prompt);
  };

  const product = manifests.get("product-discovery").phases[0];
  assertApprovalTurns(product);
  assert.equal(product.turns[0].postconditions.some(({ type }) => type === "file_absent"), true);
  const productProposal = readFileSync(join(testRoot, product.turns[0].prompt), "utf8");
  const productApproval = readFileSync(join(testRoot, product.turns[1].prompt), "utf8");
  const canonicalProduct = readFileSync(
    join(testRoot, "skills", "product-discovery", "assets", "product.md"),
    "utf8"
  );
  const canonicalHeadings = canonicalProduct.match(/^## .+$/gm);
  assert.equal(canonicalProduct.startsWith("# Product brief\n"), true);
  assert.deepEqual(canonicalHeadings, [
    "## Target user",
    "## Core problem",
    "## Current alternative",
    "## Value proposition",
    "## MVP hypothesis",
    "## Core user journeys",
    "## Non-goals",
    "## Success criteria",
    "## Product principles and constraints",
  ]);
  assert.equal(canonicalHeadings.every((heading) => productProposal.includes(heading)), true);
  assert.match(productProposal, /show.*full.*proposal/is);
  assert.doesNotMatch(
    productProposal,
    /frontmatter (?:with|containing)|status:|Reading List Product Brief/i
  );
  assert.match(productApproval, /explicitly approve/i);
  assert.match(productApproval, /write.*`docs\/product\.md`/is);
  assert.doesNotMatch(
    productApproval,
    /frontmatter (?:with|containing)|status:|Reading List Product Brief/i
  );
  assert.equal(
    product.postconditions.some(
      ({ type, command, args }) =>
        type === "command" &&
        command === "node" &&
        JSON.stringify(args) === JSON.stringify(["scripts/check-postcondition.mjs", "product"])
    ),
    true
  );

  const spec = manifests.get("spec-refinement").phases[0];
  assertApprovalTurns(spec);
  assert.match(readFileSync(join(testRoot, spec.turns[0].prompt), "utf8"), /plus-ultra:spec/);
  assert.doesNotMatch(
    readFileSync(join(testRoot, spec.turns[0].prompt), "utf8"),
    /plus-ultra:refine-issues/
  );
  assert.equal(
    spec.turns[0].postconditions.some(
      ({ type, path, text }) =>
        type === "file_contains" &&
        path === "specs/002-search-reading-list.md" &&
        text === "status: draft"
    ),
    true
  );
  assert.equal(manifests.get("spec-refinement").current_date, "2026-09-08");
  assert.match(
    readFileSync(join(testRoot, spec.turns[0].prompt), "utf8"),
    /created: 2026-09-08/
  );
  assert.equal(
    spec.turns[0].postconditions.some(
      ({ type, path, text }) =>
        type === "file_contains" &&
        path === "specs/002-search-reading-list.md" &&
        text === "created: 2026-09-08"
    ),
    true
  );
  assert.equal(
    spec.postconditions.some(
      ({ type, path, text }) =>
        type === "file_contains" &&
        path === "specs/002-search-reading-list.md" &&
        text === "status: approved"
    ),
    true
  );
  assert.equal(
    spec.postconditions.some(
      ({ type, path, text }) =>
        type === "file_contains" &&
        path === "specs/002-search-reading-list.md" &&
        text === "created: 2026-09-08"
    ),
    true
  );
});

test("implementation scenarios distinguish localized FAST work from multi-file STANDARD TDD", () => {
  const manifests = new Map(repositoryScenarioManifests().map((manifest) => [manifest.id, manifest]));
  const fast = manifests.get("fast-implementation");
  const standard = manifests.get("standard-implementation");

  assert.equal(fast.workflow.risk, "FAST");
  assert.equal(fast.workflow.localized, true);
  assert.deepEqual(fast.workflow.allowed_changes, ["src/format.mjs", "test/format.test.mjs"]);
  assert.deepEqual(fast.workflow.required_changes, ["src/format.mjs", "test/format.test.mjs"]);
  assert.equal(
    fast.phases[0].postconditions.some(
      ({ type, path, text }) =>
        type === "file_contains" &&
        path === "test/format.test.mjs" &&
        text === 'assert.equal(normalizeTitle("  The\\t Left\\nHand  "), "The Left Hand")'
    ),
    true
  );
  assert.equal(
    fast.phases[0].postconditions.some(
      ({ type, command, args }) =>
        type === "command" &&
        command === "node" &&
        JSON.stringify(args) === JSON.stringify(["--test", "test/format.test.mjs"])
    ),
    true
  );
  assert.equal(fast.phases[0].postconditions.some(({ args }) => args?.includes("fast")), true);

  assert.equal(standard.workflow.risk, "STANDARD");
  assert.equal(standard.workflow.tdd, true);
  assert.equal(standard.workflow.required_source_files.length, 3);
  assert.equal(new Set(standard.workflow.required_source_files).size, standard.workflow.required_source_files.length);
  assert.deepEqual(standard.workflow.allowed_changes, [
    "src/library.mjs",
    "src/format.mjs",
    "src/cli.mjs",
    "test/format.test.mjs",
    "test/library.test.mjs",
    "test/tag-filtering.test.mjs",
  ]);
  assert.deepEqual(standard.workflow.required_changes, [
    "src/library.mjs",
    "src/format.mjs",
    "src/cli.mjs",
    "test/tag-filtering.test.mjs",
  ]);
  assert.equal(
    standard.phases[0].postconditions.some(
      ({ type, path, text }) =>
        type === "file_contains" &&
        path === "test/tag-filtering.test.mjs" &&
        text === 'test("supports repeatable normalized tags through the CLI"'
    ),
    true
  );
  assert.equal(
    standard.phases[0].postconditions.some(
      ({ type, command, args }) =>
        type === "command" &&
        command === "node" &&
        JSON.stringify(args) === JSON.stringify(["--test", "test/tag-filtering.test.mjs"])
    ),
    true
  );
  assert.equal(
    standard.phases[0].postconditions.some(
      ({ type, command, args }) =>
        type === "command" && command === "node" && JSON.stringify(args) === JSON.stringify(["--test"])
    ),
    true
  );
  assert.equal(standard.phases[0].postconditions.some(({ args }) => args?.includes("standard")), true);
  assert.match(readFileSync(join(testRoot, standard.phases[0].turns[0].prompt), "utf8"), /failing test.*first/is);
  assert.equal(
    versionedFakeCodexSource().includes(JSON.stringify(canonicalTagFilteringTestSource)),
    true
  );
});

test("implementation contracts accept behavioral FAST evidence and prompt-authorized STANDARD tests", () => {
  const fast = createVersionedBenchmarkRepository();
  const fastRun = runBenchmarkCli(
    fast,
    [
      "run",
      "--model",
      "gpt-test",
      "--reasoning",
      "medium",
      "--scenario",
      "fast-implementation",
    ],
    { FAKE_CODEX_FAST_TEST_NAME: "normalizes all runs of whitespace" }
  );
  assert.equal(fastRun.status, 0, fastRun.stderr);

  const standard = createVersionedBenchmarkRepository();
  const standardRun = runBenchmarkCli(
    standard,
    [
      "run",
      "--model",
      "gpt-test",
      "--reasoning",
      "medium",
      "--scenario",
      "standard-implementation",
    ],
    { FAKE_CODEX_STANDARD_UPDATE_EXISTING_TESTS: "1" }
  );
  assert.equal(standardRun.status, 0, standardRun.stderr);

  const unrelated = createVersionedBenchmarkRepository();
  const unrelatedRun = runBenchmarkCli(
    unrelated,
    [
      "run",
      "--model",
      "gpt-test",
      "--reasoning",
      "medium",
      "--scenario",
      "standard-implementation",
    ],
    {
      FAKE_CODEX_STANDARD_OUT_OF_SCOPE: "1",
      FAKE_CODEX_STANDARD_UPDATE_EXISTING_TESTS: "1",
    }
  );
  assert.equal(unrelatedRun.status, 1);
  const summary = JSON.parse(readFileSync(cliJson(unrelatedRun).summary, "utf8"));
  assert.match(summary.phases[0].samples[0].error, /package\.json/);
  assert.doesNotMatch(
    summary.phases[0].samples[0].error,
    /test\/(?:format|library)\.test\.mjs/
  );
});

test("PR review cycle models immutable blocker and corrected heads with prior tagged review state", () => {
  const manifest = repositoryScenarioManifests().find(({ id }) => id === "pr-review-cycle");
  const state = JSON.parse(
    readFileSync(join(testRoot, "benchmarks", "fake-github", "state.json"), "utf8")
  );
  assert.equal(
    state.remote_spec.content,
    readFileSync(
      join(testRoot, "benchmarks", "fixtures", "reading-list", state.remote_spec.path),
      "utf8"
    )
  );
  assert.equal(
    state.heads.corrected.files["test/tag-filtering.test.mjs"],
    canonicalTagFilteringTestSource
  );

  assert.deepEqual(manifest.phases.map(({ phase }) => phase), ["first-pr-review", "pr-re-review"]);
  assert.match(state.heads.blocked.oid, /^[a-f0-9]{40}$/);
  assert.match(state.heads.corrected.oid, /^[a-f0-9]{40}$/);
  assert.notEqual(state.heads.blocked.oid, state.heads.corrected.oid);
  assert.equal(state.heads.blocked.known_blocker.code, "missing-title-validation");
  assert.equal(
    state.heads.blocked.files[state.heads.blocked.known_blocker.path]
      .split("\n")
      [state.heads.blocked.known_blocker.line - 1].includes(state.heads.blocked.known_blocker.code),
    true
  );
  assert.equal(state.heads.corrected.resolves, "missing-title-validation");
  assert.equal(state.prior_review.tag, "<!-- plus-ultra:pr-review:inline -->");
  assert.equal(state.prior_review.head_oid, state.heads.blocked.oid);
  assert.equal(state.prior_review.thread.isResolved, false);
  assert.equal(manifest.phases[0].expected_head, state.heads.blocked.oid);
  assert.equal(manifest.phases[1].expected_head, state.heads.corrected.oid);
  assert.equal(manifest.phases[1].prior_review_tag, state.prior_review.tag);
  assert.equal(manifest.phases[1].expected_resolution, "missing-title-validation");
  assert.deepEqual(state.required_contract_paths, [
    "src/library.mjs",
    "src/format.mjs",
    "src/cli.mjs",
    "test/tag-filtering.test.mjs",
  ]);
  assert.deepEqual(
    state.heads.corrected.changed_files.map(({ filename }) => filename).sort(),
    [...state.required_contract_paths].sort()
  );
  assert.equal(
    state.required_contract_paths.every((path) =>
      state.heads.corrected.diff.includes(`diff --git a/${path} b/${path}`)
    ),
    true
  );
  const rereviewPrompt = readFileSync(
    join(testRoot, manifest.phases[1].turns[0].prompt),
    "utf8"
  );
  assert.equal(state.required_contract_paths.every((path) => rereviewPrompt.includes(path)), true);
  assert.match(rereviewPrompt, /Ready verdict.*only after/is);

  const corrected = mkdtempSync(join(tmpdir(), "corrected-review-head-"));
  temporaryBenchmarkRepositories.add(corrected);
  cpSync(join(testRoot, "benchmarks", "fixtures", "reading-list"), corrected, {
    recursive: true,
  });
  for (const [path, source] of Object.entries(state.heads.corrected.files)) {
    const destination = join(corrected, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, source);
  }
  const runnable = spawnSync(
    process.execPath,
    ["--test"],
    { cwd: corrected, encoding: "utf8" }
  );
  assert.equal(runnable.status, 0, runnable.stderr);

  const libraryContract = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      [
        'import assert from "node:assert/strict";',
        'import { addEntry, filterByTag, markRead } from "./src/library.mjs";',
        'import { formatEntry } from "./src/format.mjs";',
        'const original = [{ id: 9, title: "Dune", read: false }];',
        'assert.throws(() => addEntry(original, "   "), /title is required/);',
        'assert.throws(() => markRead(original, "10"), /entry 10 was not found/);',
        'const updated = addEntry(original, "The Left Hand", ["Sci-Fi", " fiction ", "sci-fi"]);',
        'console.log(JSON.stringify({ original, updated, filtered: filterByTag(updated, "SCI-FI"), read: markRead(original, "9"), plain: formatEntry(original[0]), tagged: formatEntry(updated[1]) }));',
      ].join(" "),
    ],
    { cwd: corrected, encoding: "utf8" }
  );
  assert.equal(libraryContract.status, 0, libraryContract.stderr);
  assert.deepEqual(JSON.parse(libraryContract.stdout), {
    original: [{ id: 9, title: "Dune", read: false }],
    updated: [
      { id: 9, title: "Dune", read: false },
      {
        id: 10,
        title: "The Left Hand",
        read: false,
        tags: ["fiction", "sci-fi"],
      },
    ],
    filtered: [
      {
        id: 10,
        title: "The Left Hand",
        read: false,
        tags: ["fiction", "sci-fi"],
      },
    ],
    read: [{ id: 9, title: "Dune", read: true }],
    plain: "[ ] 9 Dune",
    tagged: "[ ] 10 The Left Hand #fiction #sci-fi",
  });

  const dataPath = join(corrected, "entries.json");
  writeFileSync(dataPath, '[{"id":9,"title":"Dune","read":false}]\n');
  const cliEnvironment = { ...process.env, READING_LIST_FILE: dataPath };
  const add = spawnSync(
    process.execPath,
    ["src/cli.mjs", "add", "The", "Left", "Hand", "--tag", "Sci-Fi", "--tag", "fiction", "--tag", "sci-fi"],
    { cwd: corrected, encoding: "utf8", env: cliEnvironment }
  );
  assert.equal(add.status, 0, add.stderr);
  assert.equal(add.stdout, "Added 10\n");
  const list = spawnSync(process.execPath, ["src/cli.mjs", "list", "--tag", "SCI-FI"], {
    cwd: corrected,
    encoding: "utf8",
    env: cliEnvironment,
  });
  assert.equal(list.status, 0, list.stderr);
  assert.equal(list.stdout, "[ ] 10 The Left Hand #fiction #sci-fi\n");
});

test("versioned fake gh serves only declared operations and logs permitted mutations locally", () => {
  const directory = join(testRoot, "benchmarks", "fake-github");
  const executable = join(directory, "gh");
  const statePath = join(mkdtempSync(join(tmpdir(), "fake-gh-state-")), "state.json");
  const logPath = join(dirname(statePath), "mutations.jsonl");
  temporaryBenchmarkRepositories.add(dirname(statePath));
  cpSync(join(directory, "state.json"), statePath);
  writeFileSync(logPath, "");
  const invoke = (phase, args) =>
    spawnSync(executable, args, {
      encoding: "utf8",
      env: {
        ...process.env,
        PLUS_ULTRA_BENCHMARK_GH_STATE: statePath,
        PLUS_ULTRA_BENCHMARK_GH_LOG: logPath,
        PLUS_ULTRA_BENCHMARK_PHASE: phase,
      },
    });

  const metadata = "number,baseRefName,baseRefOid,headRefName,headRepository,state,url,headRefOid";
  const threadQuery =
    "query=query ReviewThreads { repository(owner: $owner, name: $name) { pullRequest(number: $number) { reviewThreads(first: 1, after: $cursor) { nodes { id isResolved comments(first: 20) { nodes { author { login } body path line originalLine diffSide } } } pageInfo { hasNextPage endCursor } } } } }";
  const inspect = (phase, headOid) => {
    const calls = [
      ["auth", "status"],
      ["pr", "view", "17"],
      ["pr", "view", "17", "--json", "closingIssuesReferences"],
      ["pr", "view", "17", "--json", metadata],
      ["issue", "view", "101", "--json", "number,title,body,labels"],
      ["api", `repos/example/reading-list/contents/specs?ref=${headOid}`],
      ["api", `repos/example/reading-list/contents/specs/001-tag-filtering.md?ref=${headOid}`],
      [
        "api",
        `repos/example/reading-list/compare/${"c".repeat(40)}...${headOid}`,
      ],
      ["api", "repos/example/reading-list/pulls/17/files?per_page=100&page=1"],
      ["pr", "diff", "17"],
      ["api", "user"],
    ];
    const evidencePaths =
      phase === "pr-re-review"
        ? ["src/library.mjs", "src/format.mjs", "src/cli.mjs", "test/tag-filtering.test.mjs"]
        : ["src/library.mjs"];
    calls.splice(
      -2,
      0,
      ...evidencePaths.map((path) => [
        "api",
        `repos/example/reading-list/contents/${path}?ref=${headOid}`,
      ])
    );
    for (const call of calls) {
      const result = invoke(phase, call);
      assert.equal(result.status, 0, `${call.join(" ")}: ${result.stderr}`);
    }
    let cursor;
    do {
      const call = [
        "api",
        "graphql",
        "-f",
        threadQuery,
        "-F",
        "owner=example",
        "-F",
        "name=reading-list",
        "-F",
        "number=17",
      ];
      if (cursor) call.push("-f", `cursor=${cursor}`);
      const result = invoke(phase, call);
      assert.equal(result.status, 0, result.stderr);
      const page = JSON.parse(result.stdout).data.repository.pullRequest.reviewThreads;
      cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (cursor);
    const summaries = invoke(phase, [
      "api",
      "--paginate",
      "repos/example/reading-list/issues/17/comments?per_page=100",
    ]);
    assert.equal(summaries.status, 0, summaries.stderr);
    const refreshed = invoke(phase, ["pr", "view", "17", "--json", metadata]);
    assert.equal(refreshed.status, 0, refreshed.stderr);
    assert.equal(JSON.parse(refreshed.stdout).headRefOid, headOid);
  };

  inspect("first-pr-review", "a".repeat(40));
  const inline = invoke("first-pr-review", [
    "api",
    "repos/example/reading-list/pulls/17/comments",
    "--method",
    "POST",
    "-f",
    "body=<!-- plus-ultra:pr-review:inline -->\nImportant: missing-title-validation",
    "-f",
    `commit_id=${"a".repeat(40)}`,
    "-f",
    "path=src/library.mjs",
    "-F",
    "line=5",
    "-f",
    "side=RIGHT",
  ]);
  assert.equal(inline.status, 0, inline.stderr);
  const firstSummary = invoke("first-pr-review", [
    "api",
    "repos/example/reading-list/issues/17/comments",
    "--method",
    "POST",
    "-f",
    "body=<!-- plus-ultra:pr-review:summary -->\n# Plus Ultra PR Review\n\n## Status\n\n⛔ Changes required — one or more blockers.\n\nmissing-title-validation",
  ]);
  assert.equal(firstSummary.status, 0, firstSummary.stderr);

  const prematureResolution = invoke("pr-re-review", [
    "api",
    "graphql",
    "-f",
    "query=mutation ResolveReviewThread { resolveReviewThread(input: {threadId: $threadId}) { thread { isResolved } } }",
    "-F",
    "threadId=BENCHMARK_THREAD_1",
  ]);
  assert.equal(prematureResolution.status, 64);
  assert.match(prematureResolution.stderr, /contract evidence is missing remote files/i);
  assert.equal(JSON.parse(readFileSync(statePath, "utf8")).prior_review.thread.isResolved, false);

  inspect("pr-re-review", "b".repeat(40));
  const resolveThread = invoke("pr-re-review", [
    "api",
    "graphql",
    "-f",
    "query=mutation ResolveReviewThread { resolveReviewThread(input: {threadId: $threadId}) { thread { isResolved } } }",
    "-F",
    "threadId=BENCHMARK_THREAD_1",
  ]);
  assert.equal(resolveThread.status, 0, resolveThread.stderr);
  const resolution = invoke("pr-re-review", [
    "api",
    "repos/example/reading-list/issues/comments/9001",
    "--method",
    "PATCH",
    "-f",
    `body=<!-- plus-ultra:pr-review:summary -->\n# Plus Ultra PR Review\n\n## Status\n\n✅ Ready — no findings or non-blocking findings.\n\n<!-- plus-ultra:pr-review:resolution missing-title-validation=resolved -->`,
  ]);
  assert.equal(resolution.status, 0, resolution.stderr);

  const unknown = invoke("pr-re-review", ["repo", "delete", "example/reading-list"]);
  assert.equal(unknown.status, 64);
  assert.match(unknown.stderr, /unknown fake gh operation/i);

  const audit = readFileSync(logPath, "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(
    audit.filter(({ kind }) => kind === "mutation").map(({ operation }) => operation),
    [
      "create_inline_comment",
      "create_review_summary",
      "resolve_review_thread",
      "update_review_summary",
    ]
  );
  assert.equal(audit.at(-1).kind, "denied");
  assert.equal(audit.every(({ state_path, body, args }) => !state_path && !body && !args), true);
  const finalState = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(finalState.prior_review.thread.isResolved, true);
  assert.deepEqual(
    finalState.mutations.find(({ operation }) => operation === "update_review_summary").resolutions,
    [{ finding: "missing-title-validation", status: "resolved" }]
  );

  const unresolvedState = join(dirname(statePath), "unresolved-state.json");
  const unresolvedLog = join(dirname(statePath), "unresolved-log.jsonl");
  cpSync(join(directory, "state.json"), unresolvedState);
  writeFileSync(unresolvedLog, "");
  const unresolved = spawnSync(
    executable,
    [
      "api",
      "repos/example/reading-list/issues/comments/9001",
      "--method",
      "PATCH",
      "-f",
      "body=<!-- plus-ultra:pr-review:summary -->\n<!-- plus-ultra:pr-review:resolution missing-title-validation=unresolved -->",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PLUS_ULTRA_BENCHMARK_GH_STATE: unresolvedState,
        PLUS_ULTRA_BENCHMARK_GH_LOG: unresolvedLog,
        PLUS_ULTRA_BENCHMARK_PHASE: "pr-re-review",
      },
    }
  );
  assert.equal(unresolved.status, 64);
  assert.equal(JSON.parse(readFileSync(unresolvedState, "utf8")).mutations.length, 0);
});

test("runner fails FAST samples that escape allowed changes or omit required changes", () => {
  const escaped = createBenchmarkRepository();
  const escapedManifestPath = join(
    escaped.root,
    "benchmarks",
    "scenarios",
    "fast-implementation.json"
  );
  const escapedManifest = JSON.parse(readFileSync(escapedManifestPath, "utf8"));
  escapedManifest.workflow = {
    risk: "FAST",
    allowed_changes: ["result.txt"],
    required_changes: ["result.txt"],
  };
  writeJson(escapedManifestPath, escapedManifest);
  runGit(escaped.root, ["add", "benchmarks/scenarios/fast-implementation.json"]);
  runGit(escaped.root, ["commit", "-m", "test: add FAST change contract"]);
  refreshBenchmarkStage(escaped.root);

  const escapedRun = runBenchmarkCli(
    escaped,
    ["run", "--model", "gpt-test", "--reasoning", "medium", "--scenario", "fast-implementation"],
    { FAKE_CODEX_OUT_OF_SCOPE_PHASE: "fast-implementation" }
  );
  assert.equal(escapedRun.status, 1);
  const escapedSummary = JSON.parse(readFileSync(cliJson(escapedRun).summary, "utf8"));
  assert.match(escapedSummary.phases[0].samples[0].error, /outside.*allowed/i);

  const missing = createBenchmarkRepository();
  const missingManifestPath = join(
    missing.root,
    "benchmarks",
    "scenarios",
    "fast-implementation.json"
  );
  const missingManifest = JSON.parse(readFileSync(missingManifestPath, "utf8"));
  missingManifest.workflow = {
    risk: "FAST",
    allowed_changes: ["result.txt", "test/regression.test.mjs"],
    required_changes: ["result.txt", "test/regression.test.mjs"],
  };
  writeJson(missingManifestPath, missingManifest);
  runGit(missing.root, ["add", "benchmarks/scenarios/fast-implementation.json"]);
  runGit(missing.root, ["commit", "-m", "test: require FAST regression"]);
  refreshBenchmarkStage(missing.root);

  const missingRun = runBenchmarkCli(missing, [
    "run",
    "--model",
    "gpt-test",
    "--reasoning",
    "medium",
    "--scenario",
    "fast-implementation",
  ]);
  assert.equal(missingRun.status, 1);
  const missingSummary = JSON.parse(readFileSync(cliJson(missingRun).summary, "utf8"));
  assert.match(missingSummary.phases[0].samples[0].error, /required.*test\/regression/i);
});

test("all five versioned scenarios execute through the runner using only local fakes", () => {
  const repository = createVersionedBenchmarkRepository();

  const run = runBenchmarkCli(repository, [
    "run",
    "--model",
    "gpt-test",
    "--reasoning",
    "medium",
  ]);

  const output = cliJson(run);
  const summary = JSON.parse(readFileSync(output.summary, "utf8"));
  assert.equal(run.status, 0, `${run.stderr}\n${run.stdout}\n${JSON.stringify(summary, null, 2)}`);
  assert.equal(summary.status, "complete");
  assert.equal(summary.executed_scenarios.length, 5);
  assert.deepEqual(summary.phases.map(({ phase }) => phase), [
    "product-discovery",
    "spec-refinement",
    "fast-implementation",
    "standard-implementation",
    "first-pr-review",
    "pr-re-review",
  ]);
  assert.equal(summary.phases.every(({ samples }) => samples.length === 2), true);
  const codexRecords = readFileSync(repository.log, "utf8").trim().split("\n").map(JSON.parse);
  const invocations = codexRecords.filter(({ args }) => args);
  assert.equal(invocations.length, 16);
  assert.equal(
    invocations.every(
      ({ cwd }) => cwd !== repository.root && cwd.includes("/.context/benchmarks/")
    ),
    true
  );

  const productResponse = readFileSync(
    join(
      dirname(output.summary),
      "scenarios",
      "product-discovery",
      "sample-1",
      "product-discovery.response.txt"
    ),
    "utf8"
  );
  assert.doesNotMatch(productResponse, /status:/);
  assert.match(productResponse, /# Product brief/);
  assert.deepEqual(productResponse.match(/^## .+$/gm), [
    "## Target user",
    "## Core problem",
    "## Current alternative",
    "## Value proposition",
    "## MVP hypothesis",
    "## Core user journeys",
    "## Non-goals",
    "## Success criteria",
    "## Product principles and constraints",
  ]);
  assert.deepEqual(
    codexRecords
      .filter(({ event, phase }) => event === "test_run" && phase === "standard-implementation")
      .map(({ stage, status }) => [stage, status]),
    [
      ["red", "failed-as-expected"],
      ["focused-green", "passed"],
      ["suite-green", "passed"],
      ["red", "failed-as-expected"],
      ["focused-green", "passed"],
      ["suite-green", "passed"],
    ]
  );

  const reviewRoot = join(dirname(output.summary), "scenarios", "pr-review-cycle");
  const requiredReviewOperations = new Set([
    "auth_status",
    "pr_identity",
    "closing_issues",
    "closing_issue_content",
    "pr_metadata",
    "remote_spec_list",
    "remote_spec_content",
    "compare_heads",
    "changed_files",
    "remote_file_content",
    "pr_diff",
    "reviewer_identity",
    "review_threads_page",
    "canonical_summary_list",
    "create_inline_comment",
    "create_review_summary",
    "update_review_summary",
    "resolve_review_thread",
  ]);
  const observedReviewOperations = new Set();
  for (const sampleDirectory of readdirSync(reviewRoot)) {
    const audit = readFileSync(join(reviewRoot, sampleDirectory, "fake-github.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse);
    for (const entry of audit) observedReviewOperations.add(entry.operation);
    assert.equal(audit.some(({ operation }) => operation === "pr_metadata"), true);
    if (sampleDirectory.startsWith("pr-re-review")) {
      assert.deepEqual(
        [...new Set(audit.filter(({ operation }) => operation === "remote_file_content").map(({ path }) => path))].sort(),
        ["src/cli.mjs", "src/format.mjs", "src/library.mjs", "test/tag-filtering.test.mjs"]
      );
    }
    assert.equal(
      audit.filter(({ operation }) => operation === "review_threads_page").length >= 2,
      sampleDirectory.startsWith("pr-re-review")
    );
  }
  assert.deepEqual(
    [...requiredReviewOperations].filter((operation) => !observedReviewOperations.has(operation)),
    []
  );
});
