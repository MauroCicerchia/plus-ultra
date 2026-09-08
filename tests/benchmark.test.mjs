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
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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
      scenario: { fast: hash },
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
      scenario: { fast: hash },
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
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
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
  cwd: process.cwd(),
  phase: process.env.PLUS_ULTRA_BENCHMARK_PHASE,
  scenario: process.env.PLUS_ULTRA_BENCHMARK_SCENARIO,
  sample: Number(process.env.PLUS_ULTRA_BENCHMARK_SAMPLE),
  turn: Number(process.env.PLUS_ULTRA_BENCHMARK_TURN),
};
appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify(record) + "\\n");
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

function fakeGhSource() {
  return `#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
appendFileSync(process.env.PLUS_ULTRA_BENCHMARK_GH_LOG, JSON.stringify(args) + "\\n");
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
  const invocations = readFileSync(repository.log, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(invocations.length, 6);
  for (let index = 0; index < invocations.length; index += 2) {
    const initial = invocations[index];
    const resumed = invocations[index + 1];
    assert.equal(initial.args.includes("resume"), false);
    assert.equal(resumed.args.includes("resume"), true);
    assert.equal(resumed.args.includes(`product-discovery-sample-${initial.sample}`), true);
    assert.notEqual(initial.cwd, repository.root);
    assert.equal(initial.cwd.startsWith(repository.root), false);
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
