import assert from "node:assert/strict";
import test from "node:test";

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
