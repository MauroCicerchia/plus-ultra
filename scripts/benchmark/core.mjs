import { createHash } from "node:crypto";

const USAGE_FIELDS = [
  "input_tokens",
  "cached_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
];
const NUMERIC_METRICS = [
  "input_tokens",
  "cached_input_tokens",
  "non_cached_input_tokens",
  "output_tokens",
  "reasoning_tokens",
  "turns",
  "tool_calls",
  "elapsed_ms",
  "visible_context_bytes",
];
const TYPE_METRICS = ["item_types", "tool_call_types"];
const REQUIRED_METRICS = [...NUMERIC_METRICS, ...TYPE_METRICS];
const METRIC_LABELS = new Set(["exact", "observed", "estimated"]);
const TOOL_ITEM_TYPES = new Set([
  "command_execution",
  "file_change",
  "mcp_tool_call",
  "web_search",
]);

const ok = (value) => Object.freeze({ ok: true, value });
const failure = (code, message, details = {}) =>
  Object.freeze({ ok: false, error: Object.freeze({ code, ...details, message }) });
const metric = (value, label) => Object.freeze({ value, label });

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function cloneJson(value) {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneJson(child)]));
  }
  return value;
}

function validateUsage(event, line) {
  if (event.type !== "turn.completed" || event.usage === undefined) return null;
  if (!event.usage || typeof event.usage !== "object" || Array.isArray(event.usage)) {
    return failure("invalid_usage", "turn.completed usage must be an object", { line });
  }
  for (const field of USAGE_FIELDS) {
    const value = event.usage[field];
    if (value !== undefined && value !== null && (!Number.isInteger(value) || value < 0)) {
      return failure("invalid_usage", `${field} must be a non-negative integer or null`, { line });
    }
  }
  const { input_tokens: input, cached_input_tokens: cached } = event.usage;
  if (Number.isInteger(input) && Number.isInteger(cached) && cached > input) {
    return failure("inconsistent_usage", "cached_input_tokens cannot exceed input_tokens", { line });
  }
  return null;
}

function validateMetric(candidate, name, kind) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return failure("invalid_measurement", `${name} must be a metric object`);
  }
  const keys = Object.keys(candidate).sort();
  if (keys.length !== 2 || keys[0] !== "label" || keys[1] !== "value") {
    return failure("invalid_measurement", `${name} must contain only value and label`);
  }
  if (!METRIC_LABELS.has(candidate.label)) {
    return failure("invalid_measurement", `${name} has an invalid metric label`);
  }
  if (kind === "number") {
    if (
      candidate.value !== null &&
      (!Number.isFinite(candidate.value) || candidate.value < 0)
    ) {
      return failure("invalid_measurement", `${name} must contain a non-negative number or null`);
    }
    return null;
  }
  if (
    candidate.value !== null &&
    (!Array.isArray(candidate.value) ||
      candidate.value.some((entry) => typeof entry !== "string"))
  ) {
    return failure("invalid_measurement", `${name} must contain a string array or null`);
  }
  return null;
}

function validateMeasurement(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return failure("invalid_measurement", "A measurement object is required");
  }
  const keys = Object.keys(candidate).sort();
  const expected = [...REQUIRED_METRICS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    return failure("invalid_measurement", "Measurement fields are missing or unexpected");
  }
  for (const name of NUMERIC_METRICS) {
    const error = validateMetric(candidate[name], name, "number");
    if (error) return error;
  }
  for (const name of TYPE_METRICS) {
    const error = validateMetric(candidate[name], name, "types");
    if (error) return error;
  }
  return null;
}

function validatedSample(sample) {
  if (sample?.status === "failed") {
    return failure("unsuccessful_sample", "Failed samples cannot be used as measurements");
  }
  const measurement = sample?.status === "success" ? sample.measurement : sample;
  const error = validateMeasurement(measurement);
  return error ?? ok(measurement);
}

export function parseJsonl(source) {
  if (typeof source !== "string") {
    return failure("invalid_jsonl", "JSONL input must be a string");
  }
  const events = [];
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === "") continue;
    let event;
    try {
      event = JSON.parse(lines[index]);
    } catch {
      return failure("malformed_jsonl", `JSONL line ${index + 1} is not valid JSON`, {
        line: index + 1,
      });
    }
    if (
      !event ||
      typeof event !== "object" ||
      Array.isArray(event) ||
      typeof event.type !== "string"
    ) {
      return failure("invalid_event", `JSONL line ${index + 1} must be an event object with a type`, {
        line: index + 1,
      });
    }
    const usageError = validateUsage(event, index + 1);
    if (usageError) return usageError;
    events.push(deepFreeze(cloneJson(event)));
  }
  return ok(Object.freeze(events));
}

function exactUsage(events, field) {
  const turns = events.filter(({ type }) => type === "turn.completed");
  if (
    turns.length === 0 ||
    turns.some(({ usage }) => !usage || !Number.isInteger(usage[field]))
  ) {
    return null;
  }
  return turns.reduce((sum, { usage }) => sum + usage[field], 0);
}

function visibleStrings(item) {
  const values = [];
  for (const field of ["text", "command", "aggregated_output", "output"]) {
    if (typeof item?.[field] === "string") values.push(item[field]);
  }
  if (Array.isArray(item?.content)) {
    for (const content of item.content) {
      if (typeof content === "string") values.push(content);
      else if (typeof content?.text === "string") values.push(content.text);
    }
  }
  return values;
}

function observedItemTypes(events) {
  const items = new Map();
  let invocation = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.type === "thread.started") invocation += 1;
    if (!event.type.startsWith("item.") || typeof event.item?.type !== "string") continue;
    const key = event.item.id === undefined ? `event:${index}` : `${invocation}:${event.item.id}`;
    items.set(key, event.item.type);
  }
  return [...items.values()].sort();
}

function observedToolTypes(itemTypes) {
  return [...new Set(itemTypes.filter((type) => TOOL_ITEM_TYPES.has(type)))].sort();
}

function observedElapsed(events, configured) {
  if (configured !== undefined && configured !== null) return configured;
  const timestamps = events
    .map(({ timestamp }) => (typeof timestamp === "string" ? Date.parse(timestamp) : Number.NaN))
    .filter(Number.isFinite);
  if (timestamps.length < 2) return null;
  return Math.max(...timestamps) - Math.min(...timestamps);
}

export function measureJsonl(source, options = {}) {
  if (
    options.elapsedMs !== undefined &&
    options.elapsedMs !== null &&
    (!Number.isFinite(options.elapsedMs) || options.elapsedMs < 0)
  ) {
    return failure("invalid_measurement", "elapsedMs must be a non-negative number or null");
  }
  if (
    options.visibleContextBytes !== undefined &&
    options.visibleContextBytes !== null &&
    (!Number.isInteger(options.visibleContextBytes) || options.visibleContextBytes < 0)
  ) {
    return failure(
      "invalid_measurement",
      "visibleContextBytes must be a non-negative integer or null"
    );
  }
  const parsed = parseJsonl(source);
  if (!parsed.ok) return parsed;
  const events = parsed.value;
  const input = exactUsage(events, "input_tokens");
  const cached = exactUsage(events, "cached_input_tokens");
  const itemTypes = observedItemTypes(events);
  const toolItemTypes = itemTypes.filter((type) => TOOL_ITEM_TYPES.has(type));
  const visibleBytes =
    options.visibleContextBytes ??
    events.reduce(
      (total, event) =>
        total +
        visibleStrings(event.item).reduce((sum, value) => sum + Buffer.byteLength(value, "utf8"), 0),
      0
    );
  const measurement = {
    input_tokens: metric(input, "exact"),
    cached_input_tokens: metric(cached, "exact"),
    non_cached_input_tokens: metric(
      input === null || cached === null ? null : input - cached,
      "observed"
    ),
    output_tokens: metric(exactUsage(events, "output_tokens"), "exact"),
    reasoning_tokens: metric(exactUsage(events, "reasoning_output_tokens"), "exact"),
    turns: metric(events.filter(({ type }) => type === "turn.completed").length, "observed"),
    item_types: metric(Object.freeze(itemTypes), "observed"),
    tool_call_types: metric(Object.freeze(observedToolTypes(toolItemTypes)), "observed"),
    tool_calls: metric(toolItemTypes.length, "observed"),
    elapsed_ms: metric(observedElapsed(events, options.elapsedMs), "observed"),
    visible_context_bytes: metric(visibleBytes, "observed"),
  };
  return ok(deepFreeze(measurement));
}

function numericMetricValue(measurement, name) {
  const value = measurement?.[name]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function samplingValue(measurement) {
  const input = numericMetricValue(measurement, "input_tokens");
  const output = numericMetricValue(measurement, "output_tokens");
  if (
    input !== null &&
    output !== null &&
    measurement.input_tokens.label === "exact" &&
    measurement.output_tokens.label === "exact"
  ) {
    return { metric: "total_tokens", value: input + output };
  }
  return {
    metric: "visible_context_bytes",
    value: numericMetricValue(measurement, "visible_context_bytes"),
  };
}

export function requiresThirdSample(firstSample, secondSample) {
  const firstResult = validatedSample(firstSample);
  if (!firstResult.ok) return firstResult;
  const secondResult = validatedSample(secondSample);
  if (!secondResult.ok) return secondResult;
  const first = firstResult.value;
  const second = secondResult.value;
  const left = samplingValue(first);
  const right = samplingValue(second);
  if (left.metric !== right.metric || left.value === null || right.value === null) {
    const fallbackLeft = numericMetricValue(first, "visible_context_bytes");
    const fallbackRight = numericMetricValue(second, "visible_context_bytes");
    if (fallbackLeft === null || fallbackRight === null) {
      return ok(deepFreeze({ required: false, metric: null, relative_difference: null }));
    }
    return samplingDecision("visible_context_bytes", fallbackLeft, fallbackRight);
  }
  return samplingDecision(left.metric, left.value, right.value);
}

function samplingDecision(name, left, right) {
  const difference = Math.abs(left - right);
  const midpoint = median([left, right]);
  if (midpoint === 0) {
    return ok(
      deepFreeze({
        required: difference !== 0,
        metric: name,
        relative_difference: difference === 0 ? 0 : null,
      })
    );
  }
  const relativeDifference = difference / midpoint;
  return ok(
    deepFreeze({
      required: relativeDifference > 0.1,
      metric: name,
      relative_difference: relativeDifference,
    })
  );
}

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function aggregateMeasurements(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return failure("missing_samples", "At least one successful measurement is required");
  }
  const validated = samples.map(validatedSample);
  const invalid = validated.find((result) => !result.ok);
  if (invalid) {
    return invalid;
  }
  const measurements = validated.map(({ value }) => value);
  const aggregate = {};
  for (const name of NUMERIC_METRICS) {
    const values = measurements
      .map((measurement) => numericMetricValue(measurement, name))
      .filter((value) => value !== null);
    const label =
      measurements.find((measurement) => measurement?.[name])?.[name]?.label ??
      (USAGE_FIELDS.includes(name) ? "exact" : "observed");
    aggregate[name] = metric(values.length === measurements.length ? median(values) : null, label);
  }
  for (const name of TYPE_METRICS) {
    const values = measurements.flatMap((measurement) =>
      Array.isArray(measurement?.[name]?.value) ? measurement[name].value : []
    );
    aggregate[name] = metric(Object.freeze([...new Set(values)].sort()), "observed");
  }
  return ok(deepFreeze(aggregate));
}

function roundedBudget(value, increment) {
  return value === null ? null : Math.ceil((value * 1.2) / increment) * increment;
}

export function calculateBudgets(aggregate) {
  const invalid = validateMeasurement(aggregate);
  if (invalid) return invalid;
  const value = (name) => numericMetricValue(aggregate, name);
  const toolTypes = aggregate.tool_call_types?.value;
  if (toolTypes !== null && toolTypes !== undefined && !Array.isArray(toolTypes)) {
    return failure("invalid_aggregate", "tool_call_types must be an array or null");
  }
  return ok(
    deepFreeze({
      input_tokens: roundedBudget(value("input_tokens"), 1000),
      cached_input_tokens: roundedBudget(value("cached_input_tokens"), 1000),
      non_cached_input_tokens: roundedBudget(value("non_cached_input_tokens"), 1000),
      output_tokens: roundedBudget(value("output_tokens"), 100),
      reasoning_tokens: roundedBudget(value("reasoning_tokens"), 1000),
      turns: roundedBudget(value("turns"), 1),
      tool_calls:
        aggregate.tool_calls !== undefined
          ? roundedBudget(value("tool_calls"), 1)
          : Array.isArray(toolTypes)
            ? roundedBudget(toolTypes.length, 1)
            : null,
      visible_context_bytes: roundedBudget(value("visible_context_bytes"), 1024),
    })
  );
}

function canonicalize(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError("Cannot hash a cyclic value");
    const next = new Set(ancestors).add(value);
    return `[${value.map((child) => canonicalize(child, next)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    if (ancestors.has(value)) throw new TypeError("Cannot hash a cyclic value");
    const next = new Set(ancestors).add(value);
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], next)}`)
      .join(",")}}`;
  }
  throw new TypeError("Canonical hashes require JSON-compatible values");
}

export function canonicalSha256(value) {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

export function rankContributors(contributors) {
  if (!Array.isArray(contributors)) {
    return failure("invalid_contributors", "Contributors must be an array");
  }
  for (const contributor of contributors) {
    const invalid = validateContributor(contributor);
    if (invalid) return invalid;
  }
  const ranked = contributors
    .map(({ name, bytes, label }) => ({ name, bytes, label }))
    .sort(
      (left, right) =>
        right.bytes - left.bytes ||
        (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
    );
  return ok(deepFreeze(ranked));
}

const copyKeys = (source, keys) =>
  Object.fromEntries(
    keys
      .filter((key) => source?.[key] !== undefined)
      .map((key) => [key, cloneJson(source[key])])
  );

function hasExactKeys(candidate, expected) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
  const actual = Object.keys(candidate).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function validateContributor(contributor) {
  if (
    !hasExactKeys(contributor, ["name", "bytes", "label"]) ||
    typeof contributor.name !== "string" ||
    contributor.name.length === 0 ||
    !Number.isFinite(contributor.bytes) ||
    contributor.bytes < 0 ||
    !METRIC_LABELS.has(contributor.label)
  ) {
    return failure(
      "invalid_contributor",
      "Each contributor must contain only a name, non-negative bytes, and valid label"
    );
  }
  return null;
}

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const HASH_KEYS = [
  "scenario",
  "prompts",
  "fixture",
  "fake_github",
  "suite",
  "git_tree",
  "plugin_tree",
];
const SCENARIO_NAMES = [
  "product-discovery",
  "spec-refinement",
  "fast-implementation",
  "standard-implementation",
  "pr-review-cycle",
];
const BUDGET_KEYS = [
  "input_tokens",
  "cached_input_tokens",
  "non_cached_input_tokens",
  "output_tokens",
  "reasoning_tokens",
  "turns",
  "tool_calls",
  "visible_context_bytes",
];
const PHASE_NAMES = new Set([
  "product-discovery",
  "spec-refinement",
  "fast-implementation",
  "standard-implementation",
  "first-pr-review",
  "pr-re-review",
]);

function isHashRecord(value, expectedKeys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    (expectedKeys === undefined || hasExactKeys(value, expectedKeys)) &&
    Object.values(value).every((hash) => typeof hash === "string" && HASH_PATTERN.test(hash))
  );
}

function validateHashes(hashes) {
  if (!hasExactKeys(hashes, HASH_KEYS)) {
    return failure("invalid_baseline", "Baseline hashes have missing or unexpected fields");
  }
  if (!isHashRecord(hashes.scenario, SCENARIO_NAMES)) {
    return failure("invalid_baseline", "Scenario hashes must contain exactly the canonical scenarios");
  }
  if (
    !(typeof hashes.prompts === "string" && HASH_PATTERN.test(hashes.prompts)) &&
    !isHashRecord(hashes.prompts)
  ) {
    return failure("invalid_baseline", "Prompt hashes must be a SHA-256 string or hash object");
  }
  for (const key of HASH_KEYS.filter((name) => !["scenario", "prompts"].includes(name))) {
    if (typeof hashes[key] !== "string" || !HASH_PATTERN.test(hashes[key])) {
      return failure("invalid_baseline", `${key} must be a canonical SHA-256 hash`);
    }
  }
  return null;
}

function validateBudgetSet(budgets) {
  if (!budgets || typeof budgets !== "object" || Array.isArray(budgets)) {
    return failure("invalid_baseline", "Baseline budgets must be an object");
  }
  for (const [phase, budget] of Object.entries(budgets)) {
    if (!PHASE_NAMES.has(phase) || !hasExactKeys(budget, BUDGET_KEYS)) {
      return failure("invalid_baseline", "Each phase budget must have the expected fields");
    }
    if (
      Object.values(budget).some(
        (value) => value !== null && (!Number.isFinite(value) || value < 0)
      )
    ) {
      return failure("invalid_baseline", "Budget values must be non-negative numbers or null");
    }
  }
  return null;
}

function validateBaselineShape(input) {
  if (!Number.isInteger(input.schema_version) || input.schema_version < 1) {
    return failure("invalid_baseline", "schema_version must be a positive integer");
  }
  if (
    !hasExactKeys(input.profile, ["model", "reasoning_effort"]) ||
    typeof input.profile.model !== "string" ||
    input.profile.model.length === 0 ||
    typeof input.profile.reasoning_effort !== "string" ||
    input.profile.reasoning_effort.length === 0
  ) {
    return failure("invalid_baseline", "Baseline profile must contain model and reasoning_effort");
  }
  const hashError = validateHashes(input.hashes);
  if (hashError) return hashError;
  if (!Array.isArray(input.phases)) {
    return failure("invalid_baseline", "Baseline phases must be an array");
  }
  for (const phase of input.phases) {
    if (
      !phase ||
      typeof phase !== "object" ||
      Array.isArray(phase) ||
      Object.keys(phase).some((key) => !["phase", "aggregate", "samples"].includes(key)) ||
      !PHASE_NAMES.has(phase.phase)
    ) {
      return failure("invalid_baseline", "Each phase must be a recognized phase object");
    }
    const measurementError = validateMeasurement(phase.aggregate);
    if (measurementError) return measurementError;
    if (phase.samples !== undefined && !Array.isArray(phase.samples)) {
      return failure("invalid_baseline", "Transient phase samples must be an array when present");
    }
  }
  const budgetError = validateBudgetSet(input.budgets);
  if (budgetError) return budgetError;
  if (!Array.isArray(input.contributors)) {
    return failure("invalid_baseline", "Baseline contributors must be an array");
  }
  for (const contributor of input.contributors) {
    const contributorError = validateContributor(contributor);
    if (contributorError) return contributorError;
  }
  if (
    !hasExactKeys(input.environment, ["codex_version", "operating_system", "architecture"]) ||
    Object.values(input.environment).some(
      (value) => typeof value !== "string" || value.length === 0
    )
  ) {
    return failure("invalid_baseline", "Baseline environment fields must be non-empty strings");
  }
  return null;
}

function sanitizeHashes(hashes) {
  return copyKeys(hashes, HASH_KEYS);
}

function sanitizeAggregate(aggregate) {
  return Object.fromEntries(
    [...NUMERIC_METRICS, ...TYPE_METRICS]
      .filter((key) => aggregate?.[key] !== undefined)
      .map((key) => [key, copyKeys(aggregate[key], ["value", "label"])])
  );
}

function sanitizeBudgets(budgets) {
  return Object.fromEntries(
    Object.entries(budgets)
      .map(([phase, value]) => [phase, copyKeys(value, BUDGET_KEYS)])
  );
}

function containsAbsolutePath(value, seen = new WeakSet()) {
  if (typeof value === "string") {
    return (
      /(?:^|[\s"'`=(,])\/+[^\s"'`<>|]*/.test(value) ||
      /(?:^|[\s"'`=(:,])[A-Za-z]:[\\/][^\s"'`<>|]*/.test(value) ||
      /(?:^|[\s"'`=(:,])\\\\[^\\\s]+\\[^\\\s]+/.test(value)
    );
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return false;
    seen.add(value);
    return Object.entries(value).some(
      ([key, child]) => containsAbsolutePath(key, seen) || containsAbsolutePath(child, seen)
    );
  }
  return false;
}

export function sanitizeBaseline(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return failure("invalid_baseline", "Baseline input must be an object");
  }
  if (containsAbsolutePath(input)) {
    return failure("unsafe_baseline", "Baseline input contains an absolute path");
  }
  const invalid = validateBaselineShape(input);
  if (invalid) return invalid;
  const sanitized = {
    ...copyKeys(input, ["schema_version"]),
    profile: copyKeys(input.profile, ["model", "reasoning_effort"]),
    hashes: sanitizeHashes(input.hashes),
    phases: Array.isArray(input.phases)
      ? input.phases.map((phase) => ({
          ...copyKeys(phase, ["phase"]),
          aggregate: sanitizeAggregate(phase.aggregate),
        }))
      : [],
    budgets: sanitizeBudgets(input.budgets),
    contributors: Array.isArray(input.contributors)
      ? input.contributors.map((entry) => copyKeys(entry, ["name", "bytes", "label"]))
      : [],
    environment: copyKeys(input.environment, [
      "codex_version",
      "operating_system",
      "architecture",
    ]),
  };
  return ok(deepFreeze(sanitized));
}

const TOKEN_IDENTITY_FIELDS = [
  "model",
  "reasoning_effort",
  "codex_version",
  "suite_hash",
  "scenario_hash",
];

export function assessComparability(baseline, candidate, metricName) {
  const required =
    metricName === "elapsed_ms"
      ? [...TOKEN_IDENTITY_FIELDS, "operating_system", "architecture"]
      : TOKEN_IDENTITY_FIELDS;
  const drift = required.filter(
    (field) => baseline?.[field] === undefined || baseline[field] !== candidate?.[field]
  );
  return deepFreeze({ comparable: drift.length === 0, drift });
}
