import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  chmodSync,
  constants,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import {
  aggregateMeasurements,
  assessComparability,
  calculateBudgets,
  canonicalSha256,
  measureJsonl,
  rankContributors,
  requiresThirdSample,
  sanitizeBaseline,
} from "./core.mjs";

const EXPECTED_SCENARIOS = [
  "product-discovery",
  "spec-refinement",
  "fast-implementation",
  "standard-implementation",
  "pr-review-cycle",
];
const EXPECTED_PHASES = [
  "product-discovery",
  "spec-refinement",
  "fast-implementation",
  "standard-implementation",
  "first-pr-review",
  "pr-re-review",
];
const EXPECTED_PHASES_BY_SCENARIO = Object.freeze({
  "product-discovery": ["product-discovery"],
  "spec-refinement": ["spec-refinement"],
  "fast-implementation": ["fast-implementation"],
  "standard-implementation": ["standard-implementation"],
  "pr-review-cycle": ["first-pr-review", "pr-re-review"],
});
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
const MANIFEST_PATHS = new Set([
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
]);

export class BenchmarkError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BenchmarkError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new BenchmarkError(code, message);
}

function json(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail("invalid_json", `Could not read valid JSON from ${path}: ${error.message}`);
  }
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    fail("process_error", `Could not run ${basename(executable)}: ${result.error.message}`);
  }
  return result;
}

function git(root, args, { allowFailure = false, env } = {}) {
  const result = run("git", ["-C", root, ...args], { env });
  if (result.status !== 0 && !allowFailure) {
    fail("git_error", `Git command failed: ${result.stderr || result.stdout}`.trim());
  }
  return result;
}

function pathInside(root, candidate, label) {
  if (typeof candidate !== "string" || candidate.length === 0 || isAbsolute(candidate)) {
    fail("unsafe_path", `${label} must be a non-empty repository-relative path`);
  }
  const target = resolve(root, candidate);
  const rel = relative(root, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    fail("unsafe_path", `${label} escapes the repository root`);
  }
  return target;
}

function filesBelow(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const visit = (directory, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      if (entry.name === ".git") continue;
      const absolute = join(directory, entry.name);
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(absolute, path);
      else if (entry.isFile()) files.push({ path, absolute });
    }
  };
  visit(root);
  return files;
}

function bytesBelow(root, predicate = () => true) {
  return filesBelow(root)
    .filter(({ path }) => predicate(path))
    .reduce((total, { absolute }) => total + statSync(absolute).size, 0);
}

function hashFiles(files) {
  return canonicalSha256(
    files
      .map(({ path, absolute }) => ({
        path,
        sha256: createHash("sha256").update(readFileSync(absolute)).digest("hex"),
      }))
      .sort((left, right) => left.path.localeCompare(right.path))
  );
}

function normalizedTrackedContent(path, absolute) {
  const source = readFileSync(absolute);
  if (!MANIFEST_PATHS.has(path)) return source;
  try {
    const manifest = JSON.parse(source.toString("utf8"));
    delete manifest.version;
    return Buffer.from(JSON.stringify(manifest));
  } catch {
    return source;
  }
}

function trackedPaths(root) {
  const result = git(root, ["ls-files", "-z"]);
  return result.stdout.split("\0").filter(Boolean).sort();
}

function ensureCleanTree(root) {
  const status = git(root, ["status", "--porcelain", "--untracked-files=normal"]);
  if (status.stdout.trim()) {
    fail("dirty_source", "Benchmarking requires a clean source tree");
  }
}

function managedStage(root) {
  return join(root, ".context", "codex-dev-marketplace", "plugins", "plus-ultra");
}

function ensureMatchingStage(root) {
  const stage = managedStage(root);
  if (!existsSync(stage)) {
    fail(
      "missing_stage",
      "Managed plus-ultra-dev stage is missing; run node scripts/codex-local.mjs refresh"
    );
  }
  const paths = trackedPaths(root);
  const stagedPaths = filesBelow(stage).map(({ path }) => path).sort();
  if (
    stagedPaths.length !== paths.length ||
    stagedPaths.some((path, index) => path !== paths[index])
  ) {
    fail(
      "stale_stage",
      "Managed plus-ultra-dev stage does not match source; run node scripts/codex-local.mjs refresh"
    );
  }
  for (const path of paths) {
    const staged = join(stage, path);
    if (!existsSync(staged) || !lstatSync(staged).isFile()) {
      fail(
        "stale_stage",
        "Managed plus-ultra-dev stage does not match source; run node scripts/codex-local.mjs refresh"
      );
    }
    const sourceContent = normalizedTrackedContent(path, join(root, path));
    const stagedContent = normalizedTrackedContent(path, staged);
    if (!sourceContent.equals(stagedContent)) {
      fail(
        "stale_stage",
        "Managed plus-ultra-dev stage does not match source; run node scripts/codex-local.mjs refresh"
      );
    }
  }
  return stage;
}

function readScenarioManifests(root) {
  const scenarioRoot = join(root, "benchmarks", "scenarios");
  if (!existsSync(scenarioRoot)) {
    fail("missing_scenarios", "benchmarks/scenarios is missing");
  }
  const paths = readdirSync(scenarioRoot)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(scenarioRoot, name));
  const manifests = paths
    .map((path) => ({ path, value: json(path) }))
    .sort(
      (left, right) =>
        EXPECTED_SCENARIOS.indexOf(left.value?.id) - EXPECTED_SCENARIOS.indexOf(right.value?.id)
    );
  const ids = manifests.map(({ value }) => value?.id).sort();
  const expectedIds = [...EXPECTED_SCENARIOS].sort();
  if (ids.length !== expectedIds.length || ids.some((id, index) => id !== expectedIds[index])) {
    fail("invalid_scenarios", "Benchmark suite must contain exactly the five canonical scenarios");
  }

  const phases = [];
  for (const { path, value } of manifests) {
    if (value?.schema_version !== 1 || !Array.isArray(value.phases) || value.phases.length === 0) {
      fail("invalid_scenario", `${basename(path)} must be a schema-version 1 scenario with phases`);
    }
    const expectedOwnedPhases = EXPECTED_PHASES_BY_SCENARIO[value.id];
    const ownedPhases = value.phases.map(({ phase }) => phase);
    if (
      ownedPhases.length !== expectedOwnedPhases.length ||
      ownedPhases.some((phase, index) => phase !== expectedOwnedPhases[index])
    ) {
      fail("invalid_scenario", `${value.id} has invalid phase ownership`);
    }
    const fixture = pathInside(root, value.fixture, `${value.id} fixture`);
    if (!existsSync(fixture) || !statSync(fixture).isDirectory()) {
      fail("invalid_scenario", `${value.id} fixture directory is missing`);
    }
    for (const phase of value.phases) {
      if (
        !EXPECTED_PHASES.includes(phase?.phase) ||
        !Array.isArray(phase.turns) ||
        phase.turns.length === 0
      ) {
        fail("invalid_scenario", `${value.id} contains an invalid phase`);
      }
      phases.push(phase.phase);
      for (let index = 0; index < phase.turns.length; index += 1) {
        const turn = phase.turns[index];
        if (!turn || typeof turn !== "object") {
          fail("invalid_scenario", `${phase.phase} turn is invalid`);
        }
        const prompt = pathInside(root, turn.prompt, `${phase.phase} prompt`);
        if (!existsSync(prompt) || !statSync(prompt).isFile()) {
          fail("invalid_scenario", `${phase.phase} prompt is missing`);
        }
        if (turn.resume === true && index === 0) {
          fail("invalid_scenario", `${phase.phase} cannot resume its first turn`);
        }
      }
      validatePostconditions(phase.postconditions ?? [], phase.phase);
    }
  }
  if (
    phases.length !== EXPECTED_PHASES.length ||
    phases.some((phase, index) => phase !== EXPECTED_PHASES[index])
  ) {
    fail("invalid_scenarios", "Benchmark suite must expose the six canonical phases in order");
  }
  const fakeGh = join(root, "benchmarks", "fake-github", "gh");
  const fakeState = join(root, "benchmarks", "fake-github", "state.json");
  if (!existsSync(fakeGh) || !lstatSync(fakeGh).isFile() || !existsSync(fakeState)) {
    fail("missing_fake_github", "Benchmark suite requires fake-github/gh and state.json");
  }
  try {
    accessSync(fakeGh, constants.X_OK);
  } catch {
    fail("unsafe_fake_github", "Benchmark fake gh must be executable");
  }
  return manifests.map(({ path, value }) => ({ ...value, manifest_path: path }));
}

function validatePostconditions(postconditions, phase) {
  if (!Array.isArray(postconditions)) {
    fail("invalid_scenario", `${phase} postconditions must be an array`);
  }
  for (const condition of postconditions) {
    if (
      !condition ||
      typeof condition !== "object" ||
      !["file_exists", "file_contains", "command"].includes(condition.type)
    ) {
      fail("invalid_scenario", `${phase} contains an invalid postcondition`);
    }
    if (
      ["file_exists", "file_contains"].includes(condition.type) &&
      typeof condition.path !== "string"
    ) {
      fail("invalid_scenario", `${phase} file postcondition requires a path`);
    }
    if (condition.type === "file_contains" && typeof condition.text !== "string") {
      fail("invalid_scenario", `${phase} file_contains postcondition requires text`);
    }
    if (
      condition.type === "command" &&
      (typeof condition.command !== "string" ||
        (condition.args !== undefined && !Array.isArray(condition.args)))
    ) {
      fail("invalid_scenario", `${phase} command postcondition is invalid`);
    }
  }
}

function immutableHashes(root, manifests, stage) {
  const tracked = trackedPaths(root).map((path) => ({ path, absolute: join(root, path) }));
  const scenarios = Object.fromEntries(
    manifests.map((manifest) => [manifest.id, canonicalSha256(json(manifest.manifest_path))])
  );
  const promptPaths = [
    ...new Set(
      manifests.flatMap(({ phases }) =>
        phases.flatMap(({ turns }) => turns.map(({ prompt }) => prompt))
      )
    ),
  ].sort();
  const fixturePaths = [...new Set(manifests.map(({ fixture }) => fixture))].sort();
  const prompts = hashFiles(
    promptPaths.map((path) => ({ path, absolute: pathInside(root, path, "prompt") }))
  );
  const fixture = canonicalSha256(
    fixturePaths.map((path) => ({
      path,
      hash: hashFiles(filesBelow(pathInside(root, path, "fixture"))),
    }))
  );
  const fakeGithub = hashFiles(filesBelow(join(root, "benchmarks", "fake-github")));
  const suite = canonicalSha256({ scenarios, prompts, fixture, fake_github: fakeGithub });
  return {
    scenario: scenarios,
    prompts,
    fixture,
    fake_github: fakeGithub,
    suite,
    git_tree: hashFiles(tracked),
    plugin_tree: hashFiles(filesBelow(stage)),
  };
}

function codexVersion(environment) {
  const executable = environment.CODEX_BIN ?? "codex";
  const result = run(executable, ["--version"], { env: environment });
  if (result.status !== 0 || !result.stdout.trim()) {
    fail("codex_unavailable", "Could not determine the Codex version");
  }
  return result.stdout.trim();
}

function codexJson(executable, args, environment, label) {
  const result = run(executable, args, { env: environment });
  if (result.status !== 0) {
    fail("codex_unavailable", `Could not inspect ${label}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail("codex_unavailable", `Codex returned invalid JSON while inspecting ${label}`);
  }
}

function ensureInstalledStage(stage, environment) {
  const executable = environment.CODEX_BIN ?? "codex";
  const marketplaceRoot = dirname(dirname(stage));
  const marketplacePayload = codexJson(
    executable,
    ["plugin", "marketplace", "list", "--json"],
    environment,
    "plugin marketplaces"
  );
  const development = marketplacePayload.marketplaces?.find(
    ({ name }) => name === "plus-ultra-dev"
  );
  const registeredRoot =
    typeof development?.root === "string" && existsSync(development.root)
      ? realpathSync(development.root)
      : null;
  if (registeredRoot !== realpathSync(marketplaceRoot)) {
    fail(
      "unmanaged_stage",
      "plus-ultra-dev is not registered from the managed stage; run node scripts/codex-local.mjs refresh"
    );
  }
  const pluginPayload = codexJson(
    executable,
    ["plugin", "list", "--marketplace", "plus-ultra-dev", "--json"],
    environment,
    "installed development plugins"
  );
  const installed = pluginPayload.installed?.find(
    ({ pluginId }) => pluginId === "plus-ultra@plus-ultra-dev"
  );
  if (!installed?.installed || installed.enabled === false) {
    fail(
      "unmanaged_stage",
      "plus-ultra-dev is not installed from the managed stage; run node scripts/codex-local.mjs refresh"
    );
  }
}

export function validateBenchmark(root = process.cwd(), environment = process.env) {
  const source = realpathSync(resolve(root));
  if (!new Set(["darwin", "linux"]).has(process.platform)) {
    fail("unsupported_environment", `Unsupported operating system: ${process.platform}`);
  }
  ensureCleanTree(source);
  const stage = ensureMatchingStage(source);
  ensureInstalledStage(stage, environment);
  const scenarios = readScenarioManifests(source);
  const hashes = immutableHashes(source, scenarios, stage);
  return {
    root: source,
    stage,
    scenarios,
    scenario_count: scenarios.length,
    phases: scenarios.flatMap(({ phases }) => phases.map(({ phase }) => phase)),
    hashes,
    codex_version: codexVersion(environment),
  };
}

export function inventoryBenchmark(root = process.cwd()) {
  const source = realpathSync(resolve(root));
  const manifests = readScenarioManifests(source);
  const postconditionBytes = Buffer.byteLength(
    JSON.stringify(
      manifests.flatMap(({ phases }) =>
        phases.flatMap(({ postconditions = [] }) => postconditions)
      )
    )
  );
  const contributors = [
    {
      name: "AGENTS.md",
      bytes: existsSync(join(source, "AGENTS.md"))
        ? statSync(join(source, "AGENTS.md")).size
        : 0,
      label: "observed",
    },
    {
      name: "session-start injection",
      bytes: existsSync(join(source, "hooks", "session-start.mjs"))
        ? statSync(join(source, "hooks", "session-start.mjs")).size
        : 0,
      label: "estimated",
    },
    {
      name: "invoked skill bodies",
      bytes: bytesBelow(join(source, "skills"), (path) => path.endsWith("SKILL.md")),
      label: "estimated",
    },
    {
      name: "durable artifacts",
      bytes: bytesBelow(join(source, "specs")) + bytesBelow(join(source, "docs")),
      label: "observed",
    },
    {
      name: "prompts",
      bytes: bytesBelow(join(source, "benchmarks", "prompts")),
      label: "observed",
    },
    {
      name: "tool payloads",
      bytes: bytesBelow(join(source, "benchmarks", "fake-github"), (path) =>
        path.endsWith(".json")
      ),
      label: "estimated",
    },
    {
      name: "verification/review outputs",
      bytes: postconditionBytes,
      label: "estimated",
    },
  ];
  const ranked = rankContributors(contributors);
  if (!ranked.ok) fail(ranked.error.code, ranked.error.message);
  return { contributors: ranked.value };
}

function initializeFixtureRepository(repository) {
  const deterministic = {
    ...process.env,
    GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
  };
  git(repository, ["init", "--initial-branch=main"], { env: deterministic });
  git(repository, ["config", "user.name", "Plus Ultra benchmark"], { env: deterministic });
  git(repository, ["config", "user.email", "benchmark@plus-ultra.local"], { env: deterministic });
  git(repository, ["add", "--all"], { env: deterministic });
  git(repository, ["commit", "-m", "chore: initialize benchmark fixture"], { env: deterministic });
}

function threadIdFromJsonl(source) {
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "thread.started" && typeof event.thread_id === "string") {
        return event.thread_id;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function responsesFromJsonl(source) {
  const responses = [];
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (
        event.type === "item.completed" &&
        event.item?.type === "agent_message" &&
        typeof event.item.text === "string"
      ) {
        responses.push(event.item.text);
      }
    } catch {
      // Malformed JSONL is reported by measureJsonl; response extraction remains best-effort.
    }
  }
  return responses.join("\n");
}

function checkPostconditions(repository, postconditions, environment) {
  for (const condition of postconditions ?? []) {
    if (condition.type === "file_exists") {
      const target = pathInside(repository, condition.path, "postcondition path");
      if (!existsSync(target)) return `Expected ${condition.path} to exist`;
    } else if (condition.type === "file_contains") {
      const target = pathInside(repository, condition.path, "postcondition path");
      if (!existsSync(target) || !readFileSync(target, "utf8").includes(condition.text)) {
        return `Expected ${condition.path} to contain required text`;
      }
    } else if (condition.type === "command") {
      const result = run(condition.command, condition.args ?? [], {
        cwd: repository,
        env: environment,
      });
      const expectedStatus = condition.expected_exit ?? 0;
      if (result.status !== expectedStatus) return `Postcondition command exited ${result.status}`;
      if (condition.expected_stdout !== undefined && result.stdout !== condition.expected_stdout) {
        return "Postcondition command output did not match";
      }
    }
  }
  return null;
}

function retainFailedRepository(repository, sampleDirectory) {
  const retained = join(sampleDirectory, "failed-repository");
  if (existsSync(retained)) {
    fail("artifact_collision", `Failed repository path already exists: ${retained}`);
  }
  renameSync(repository, retained);
  return retained;
}

function isolatedPath(fakeGithubDirectory, inheritedPath) {
  const safeInheritedDirectories = (inheritedPath ?? "")
    .split(delimiter)
    .filter((directory) => isAbsolute(directory))
    .filter((directory) => resolve(directory) !== resolve(fakeGithubDirectory))
    .filter((directory) => !existsSync(join(directory, "gh")));
  return [fakeGithubDirectory, ...safeInheritedDirectories].join(delimiter);
}

function runPhaseAttempt(context, scenario, phase, sampleNumber) {
  const scenarioDirectory = join(context.runDirectory, "scenarios", scenario.id);
  const sampleName =
    scenario.phases.length === 1
      ? `sample-${sampleNumber}`
      : `${phase.phase}-sample-${sampleNumber}`;
  const sampleDirectory = join(scenarioDirectory, sampleName);
  mkdirSync(sampleDirectory, { recursive: true });
  const repository = mkdtempSync(
    join(context.runDirectory, `temporary-${scenario.id}-${phase.phase}-${sampleNumber}-`)
  );
  cpSync(pathInside(context.root, scenario.fixture, "fixture"), repository, { recursive: true });
  initializeFixtureRepository(repository);

  const statePath = join(sampleDirectory, "fake-github-state.json");
  const ghLogPath = join(sampleDirectory, "fake-github.jsonl");
  cpSync(join(context.root, "benchmarks", "fake-github", "state.json"), statePath);
  writeFileSync(ghLogPath, "");
  const fakeGithubDirectory = join(context.root, "benchmarks", "fake-github");
  const environment = {
    ...context.environment,
    PATH: isolatedPath(fakeGithubDirectory, context.environment.PATH),
    PLUS_ULTRA_BENCHMARK_GH_STATE: statePath,
    PLUS_ULTRA_BENCHMARK_GH_LOG: ghLogPath,
    PLUS_ULTRA_BENCHMARK_SCENARIO: scenario.id,
    PLUS_ULTRA_BENCHMARK_SAMPLE: String(sampleNumber),
  };
  const phaseResults = [];
  let retained;
  try {
    const started = process.hrtime.bigint();
    const outputs = [];
    const errors = [];
    let threadId;
    let phaseFailure;
    for (let turnIndex = 0; turnIndex < phase.turns.length; turnIndex += 1) {
      const turn = phase.turns[turnIndex];
      const prompt = readFileSync(pathInside(context.root, turn.prompt, "prompt"), "utf8");
      const args = [
        "exec",
        "--json",
        "--model",
        context.model,
        "--config",
        `model_reasoning_effort=${JSON.stringify(context.reasoning)}`,
        "--sandbox",
        "workspace-write",
        "--cd",
        repository,
      ];
      if (turn.resume === true) {
        if (!threadId) {
          phaseFailure = "Cannot resume approval turn because Codex did not return a thread ID";
          break;
        }
        args.push("resume", threadId);
      }
      args.push(prompt);
      const result = run(context.codex, args, {
        cwd: repository,
        env: {
          ...environment,
          PLUS_ULTRA_BENCHMARK_PHASE: phase.phase,
          PLUS_ULTRA_BENCHMARK_TURN: String(turnIndex + 1),
        },
      });
      outputs.push(result.stdout ?? "");
      errors.push(result.stderr ?? "");
      writeFileSync(
        join(sampleDirectory, `${phase.phase}-turn-${turnIndex + 1}.jsonl`),
        result.stdout ?? ""
      );
      writeFileSync(
        join(sampleDirectory, `${phase.phase}-turn-${turnIndex + 1}.stderr.txt`),
        result.stderr ?? ""
      );
      if (result.status !== 0) {
        phaseFailure = `Codex exited ${result.status}`;
        break;
      }
      threadId ??= threadIdFromJsonl(result.stdout ?? "");
    }
    const jsonl = outputs.filter(Boolean).join("\n");
    const stderr = errors.join("");
    writeFileSync(join(sampleDirectory, `${phase.phase}.jsonl`), jsonl);
    writeFileSync(join(sampleDirectory, `${phase.phase}.stderr.txt`), stderr);
    writeFileSync(join(sampleDirectory, `${phase.phase}.response.txt`), responsesFromJsonl(jsonl));
    if (!phaseFailure) {
      phaseFailure = checkPostconditions(repository, phase.postconditions, environment);
    }
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    const measured = phaseFailure ? null : measureJsonl(jsonl, { elapsedMs });
    if (measured && !measured.ok) phaseFailure = measured.error.message;
    if (phaseFailure) {
      retained = retainFailedRepository(repository, sampleDirectory);
      phaseResults.push({
        phase: phase.phase,
        sample: {
          status: "failed",
          sample: sampleNumber,
          error: phaseFailure,
          stderr,
          thread_id: threadId ?? null,
          raw_jsonl: join(sampleDirectory, `${phase.phase}.jsonl`),
          response: join(sampleDirectory, `${phase.phase}.response.txt`),
          repository: retained,
        },
      });
      return phaseResults;
    }
    phaseResults.push({
      phase: phase.phase,
      sample: {
        status: "success",
        sample: sampleNumber,
        measurement: measured.value,
        stderr,
        thread_id: threadId ?? null,
        raw_jsonl: join(sampleDirectory, `${phase.phase}.jsonl`),
        response: join(sampleDirectory, `${phase.phase}.response.txt`),
      },
    });
    return phaseResults;
  } finally {
    if (!retained && existsSync(repository)) rmSync(repository, { recursive: true, force: true });
  }
}

function appendAttempt(phaseMap, results) {
  for (const { phase, sample } of results) phaseMap.get(phase).push(sample);
}

function phaseNeedsThirdSample(samples) {
  if (samples.length !== 2 || samples.some(({ status }) => status !== "success")) {
    return false;
  }
  const decision = requiresThirdSample(samples[0], samples[1]);
  if (!decision.ok) fail(decision.error.code, decision.error.message);
  return decision.value.required;
}

function phaseHasRequiredSamples(samples) {
  const successful = samples.filter(({ status }) => status === "success");
  if (successful.length < 2) return false;
  const decision = requiresThirdSample(successful[0], successful[1]);
  if (!decision.ok) fail(decision.error.code, decision.error.message);
  return !decision.value.required || successful.length >= 3;
}

function aggregatePhase(phase, samples) {
  const successful = samples.filter(({ status }) => status === "success");
  if (successful.length < 2) return { phase, samples };
  const aggregated = aggregateMeasurements(successful);
  if (!aggregated.ok) fail(aggregated.error.code, aggregated.error.message);
  return { phase, samples, aggregate: aggregated.value };
}

function safeRunId(configured) {
  const value = configured ?? new Date().toISOString().replace(/[:.]/g, "-");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    fail("invalid_run_id", "Benchmark run ID contains unsafe characters");
  }
  return value;
}

export function runBenchmark({
  root = process.cwd(),
  model,
  reasoning,
  scenario: selectedScenario,
  environment = process.env,
} = {}) {
  if (typeof model !== "string" || !model.trim()) {
    fail("missing_model", "run requires --model <id>");
  }
  if (typeof reasoning !== "string" || !reasoning.trim()) {
    fail("missing_reasoning", "run requires --reasoning <effort>");
  }
  const validation = validateBenchmark(root, environment);
  if (selectedScenario && !EXPECTED_SCENARIOS.includes(selectedScenario)) {
    fail("unknown_scenario", `Unknown scenario: ${selectedScenario}`);
  }
  const scenarios = selectedScenario
    ? validation.scenarios.filter(({ id }) => id === selectedScenario)
    : validation.scenarios;
  const runId = safeRunId(environment.PLUS_ULTRA_BENCHMARK_RUN_ID);
  let runDirectory = join(validation.root, ".context", "benchmarks", runId);
  let suffix = 1;
  while (existsSync(runDirectory)) {
    suffix += 1;
    runDirectory = join(validation.root, ".context", "benchmarks", `${runId}-${suffix}`);
  }
  mkdirSync(runDirectory, { recursive: true });
  const context = {
    root: validation.root,
    runDirectory,
    model,
    reasoning,
    environment,
    codex: environment.CODEX_BIN ?? "codex",
  };
  const phaseMap = new Map(
    scenarios.flatMap(({ phases }) => phases.map(({ phase }) => [phase, []]))
  );
  const scenarioResults = [];
  for (const scenario of scenarios) {
    for (const phase of scenario.phases) {
      for (let sampleNumber = 1; sampleNumber <= 2; sampleNumber += 1) {
        appendAttempt(phaseMap, runPhaseAttempt(context, scenario, phase, sampleNumber));
      }
      if (phaseNeedsThirdSample(phaseMap.get(phase.phase))) {
        appendAttempt(phaseMap, runPhaseAttempt(context, scenario, phase, 3));
      }
    }
    scenarioResults.push({
      id: scenario.id,
      status: scenario.phases.every(({ phase }) => phaseHasRequiredSamples(phaseMap.get(phase)))
        ? "success"
        : "failed",
    });
  }
  const phases = [...phaseMap.entries()].map(([phase, samples]) => aggregatePhase(phase, samples));
  const budgets = Object.fromEntries(
    phases
      .filter(({ aggregate }) => aggregate)
      .map(({ phase, aggregate }) => {
        const calculated = calculateBudgets(aggregate);
        if (!calculated.ok) fail(calculated.error.code, calculated.error.message);
        return [phase, calculated.value];
      })
  );
  const inventory = inventoryBenchmark(validation.root);
  const complete = scenarioResults.every(({ status }) => status === "success");
  const summary = {
    schema_version: 1,
    run_id: basename(runDirectory),
    status: complete ? "complete" : "incomplete",
    executed_scenarios: scenarioResults,
    profile: { model, reasoning_effort: reasoning },
    hashes: validation.hashes,
    phases,
    budgets,
    contributors: inventory.contributors,
    environment: {
      codex_version: validation.codex_version,
      operating_system: process.platform,
      architecture: process.arch,
    },
    artifacts_directory: runDirectory,
  };
  const summaryPath = join(runDirectory, "summary.json");
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return { summary, summaryPath };
}

function completeRun(summary) {
  const scenarios = summary?.executed_scenarios;
  if (
    !Array.isArray(scenarios) ||
    scenarios.length !== EXPECTED_SCENARIOS.length ||
    scenarios.some(
      ({ id, status }, index) => id !== EXPECTED_SCENARIOS[index] || status !== "success"
    )
  ) {
    fail("incomplete_run", "record requires successful samples for all five scenarios");
  }
  if (
    !Array.isArray(summary.phases) ||
    summary.phases.length !== EXPECTED_PHASES.length ||
    summary.phases.some(
      ({ phase, samples, aggregate }, index) =>
        phase !== EXPECTED_PHASES[index] || !aggregate || !Array.isArray(samples)
    )
  ) {
    fail(
      "incomplete_run",
      "record requires all six phase aggregates with required successful samples"
    );
  }
  for (const { phase, samples } of summary.phases) {
    if (samples.some(({ status }) => status !== "success")) {
      fail("incomplete_run", `${phase} contains failed sample attempts`);
    }
    if (samples.length < 2) {
      fail("incomplete_run", `record requires two successful samples for ${phase}`);
    }
    const decision = requiresThirdSample(samples[0], samples[1]);
    if (!decision.ok) fail(decision.error.code, decision.error.message);
    if (decision.value.required && samples.length !== 3) {
      if (samples.length < 3) {
        fail("incomplete_run", `record requires the adaptive third sample for ${phase}`);
      }
      fail(
        "invalid_run",
        `record requires exactly three successful samples for ${phase}`
      );
    }
    if (!decision.value.required && samples.length !== 2) {
      fail("invalid_run", `record requires exactly two successful samples for ${phase}`);
    }
  }
}

export function recordBenchmark(runPath, baselinePath) {
  if (!runPath || !baselinePath) {
    fail("missing_argument", "record requires --run and --baseline");
  }
  const summary = json(resolve(runPath));
  completeRun(summary);
  const phases = summary.phases.map(({ phase, samples }) => {
    const aggregated = aggregateMeasurements(
      samples.filter(({ status }) => status === "success")
    );
    if (!aggregated.ok) fail(aggregated.error.code, aggregated.error.message);
    return { phase, aggregate: aggregated.value };
  });
  const budgets = Object.fromEntries(
    phases.map(({ phase, aggregate }) => {
      const calculated = calculateBudgets(aggregate);
      if (!calculated.ok) fail(calculated.error.code, calculated.error.message);
      return [phase, calculated.value];
    })
  );
  const candidate = {
    schema_version: summary.schema_version,
    profile: summary.profile,
    hashes: summary.hashes,
    phases,
    budgets,
    contributors: summary.contributors,
    environment: summary.environment,
  };
  const sanitized = sanitizeBaseline(candidate);
  if (!sanitized.ok) fail(sanitized.error.code, sanitized.error.message);
  const destination = resolve(baselinePath);
  mkdirSync(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(sanitized.value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, destination);
  chmodSync(destination, 0o644);
  return { baseline: destination, value: sanitized.value };
}

function scenarioIdForPhase(value, phase) {
  if (value.hashes?.scenario?.[phase]) return phase;
  if (
    ["first-pr-review", "pr-re-review"].includes(phase) &&
    value.hashes?.scenario?.["pr-review-cycle"]
  ) {
    return "pr-review-cycle";
  }
  const keys = Object.keys(value.hashes?.scenario ?? {});
  return keys.length === 1 ? keys[0] : phase;
}

function identity(value, phase) {
  const scenarioId = scenarioIdForPhase(value, phase);
  return {
    model: value.profile?.model,
    reasoning_effort: value.profile?.reasoning_effort,
    codex_version: value.environment?.codex_version,
    suite_hash: value.hashes?.suite,
    scenario_hash: value.hashes?.scenario?.[scenarioId],
    operating_system: value.environment?.operating_system,
    architecture: value.environment?.architecture,
  };
}

export function compareBenchmarks(baselinePath, candidatePath) {
  if (!baselinePath || !candidatePath) {
    fail("missing_argument", "compare requires --baseline and --candidate");
  }
  const baseline = json(resolve(baselinePath));
  const candidate = json(resolve(candidatePath));
  const candidatePhases = new Map((candidate.phases ?? []).map((phase) => [phase.phase, phase]));
  const phases = (baseline.phases ?? []).map((baselinePhase) => {
    const candidatePhase = candidatePhases.get(baselinePhase.phase);
    const metrics = {};
    for (const name of NUMERIC_METRICS) {
      const comparable = assessComparability(
        identity(baseline, baselinePhase.phase),
        identity(candidate, baselinePhase.phase),
        name
      );
      const left = baselinePhase.aggregate?.[name]?.value ?? null;
      const right = candidatePhase?.aggregate?.[name]?.value ?? null;
      if (!candidatePhase || !comparable.comparable || left === null || right === null) {
        metrics[name] = {
          comparable: false,
          drift: candidatePhase ? comparable.drift : ["missing_phase"],
        };
        continue;
      }
      const budget = baseline.budgets?.[baselinePhase.phase]?.[name] ?? null;
      metrics[name] = {
        comparable: true,
        baseline: left,
        candidate: right,
        delta: right - left,
        budget,
        status: budget === null ? "unavailable" : right <= budget ? "within" : "over",
      };
    }
    return { phase: baselinePhase.phase, metrics };
  });
  return { phases };
}

export const benchmarkContract = Object.freeze({
  scenarios: Object.freeze([...EXPECTED_SCENARIOS]),
  phases: Object.freeze([...EXPECTED_PHASES]),
});
