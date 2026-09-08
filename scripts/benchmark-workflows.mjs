#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BenchmarkError,
  compareBenchmarks,
  inventoryBenchmark,
  recordBenchmark,
  runBenchmark,
  validateBenchmark,
} from "./benchmark/runner.mjs";

function usage() {
  return [
    "Usage: node scripts/benchmark-workflows.mjs <command>",
    "",
    "Commands:",
    "  validate",
    "  inventory",
    "  run --model <id> --reasoning <effort> [--scenario <id>]",
    "  record --run <summary> --baseline <path>",
    "  compare --baseline <path> --candidate <path>",
  ].join("\n");
}

function options(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!flag.startsWith("--") || index + 1 >= args.length || args[index + 1].startsWith("--")) {
      throw new BenchmarkError("invalid_arguments", `Invalid option: ${flag}`);
    }
    const name = flag.slice(2);
    if (Object.hasOwn(parsed, name)) {
      throw new BenchmarkError("invalid_arguments", `Duplicate option: ${flag}`);
    }
    parsed[name] = args[index + 1];
    index += 1;
  }
  return parsed;
}

function requireOnly(actual, allowed) {
  const unknown = Object.keys(actual).filter((name) => !allowed.includes(name));
  if (unknown.length > 0) {
    throw new BenchmarkError("invalid_arguments", `Unknown option: --${unknown[0]}`);
  }
}

export function main(argv = process.argv.slice(2), root = process.cwd(), environment = process.env) {
  const [command, ...rest] = argv;
  const parsed = options(rest);
  if (command === "validate") {
    requireOnly(parsed, []);
    const result = validateBenchmark(root, environment);
    return { scenario_count: result.scenario_count, phases: result.phases, hashes: result.hashes };
  }
  if (command === "inventory") {
    requireOnly(parsed, []);
    return inventoryBenchmark(root);
  }
  if (command === "run") {
    requireOnly(parsed, ["model", "reasoning", "scenario"]);
    const result = runBenchmark({
      root,
      model: parsed.model,
      reasoning: parsed.reasoning,
      scenario: parsed.scenario,
      environment,
    });
    if (result.summary.status !== "complete") process.exitCode = 1;
    return { summary: result.summaryPath, status: result.summary.status };
  }
  if (command === "record") {
    requireOnly(parsed, ["run", "baseline"]);
    const result = recordBenchmark(parsed.run, parsed.baseline);
    return { baseline: result.baseline };
  }
  if (command === "compare") {
    requireOnly(parsed, ["baseline", "candidate"]);
    return compareBenchmarks(parsed.baseline, parsed.candidate);
  }
  throw new BenchmarkError("invalid_command", command ? `Unknown command: ${command}` : usage());
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  try {
    const result = main();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
