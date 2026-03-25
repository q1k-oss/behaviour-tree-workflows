/**
 * Registry utilities for registering standard nodes
 */

import type { Registry } from "./registry.js";

// Composites
import { Sequence } from "./composites/sequence.js";
import { Selector } from "./composites/selector.js";
import { Parallel } from "./composites/parallel.js";
import { Conditional } from "./composites/conditional.js";
import { ForEach } from "./composites/for-each.js";
import { While } from "./composites/while.js";
import { Recovery } from "./composites/recovery.js";
import { ReactiveSequence } from "./composites/reactive-sequence.js";
import { MemorySequence } from "./composites/memory-sequence.js";
import { SubTree } from "./composites/sub-tree.js";

// Decorators
import { Timeout } from "./decorators/timeout.js";
import { Delay } from "./decorators/delay.js";
import { Repeat } from "./decorators/repeat.js";
import { Invert } from "./decorators/invert.js";
import { ForceSuccess, ForceFailure } from "./decorators/force-result.js";
import { RunOnce } from "./decorators/run-once.js";
import { KeepRunningUntilFailure } from "./decorators/keep-running.js";
import { Precondition } from "./decorators/precondition.js";
import { SoftAssert } from "./decorators/soft-assert.js";

// Test nodes (commonly used in examples and testing)
import {
  PrintAction,
  MockAction,
  SuccessNode,
  FailureNode,
  RunningNode,
  CounterAction,
  CheckCondition,
  AlwaysCondition,
  WaitAction,
} from "./test-nodes.js";

// Scripting - Script node removed, use CodeExecution instead

// Utilities
import { LogMessage } from "./utilities/log-message.js";
import { RegexExtract } from "./utilities/regex-extract.js";
import { SetVariable } from "./utilities/set-variable.js";
import { MathOp } from "./utilities/math-op.js";
import { ArrayFilter } from "./utilities/array-filter.js";
import { Aggregate } from "./utilities/aggregate.js";
import { ThresholdCheck } from "./utilities/threshold-check.js";
import { DataTransform } from "./utilities/data-transform.js";

// Integrations
import { IntegrationAction } from "./integrations/integration-action.js";

// Activity-based action nodes
import { PythonScript } from "./actions/python-script.js";
import { ParseFile } from "./actions/parse-file.js";
import { GenerateFile } from "./actions/generate-file.js";
import { HttpRequest } from "./actions/http-request.js";
import { CodeExecution } from "./actions/code-execution.js";
import { LLMChat } from "./actions/llm-chat.js";
import { BrowserAgent } from "./actions/browser-agent.js";
import { ClaudeAgent } from "./actions/claude-agent.js";
import { GitHubAction } from "./actions/github-action.js";
import { HumanTask } from "./actions/human-task.js";
import { LLMToolCall } from "./actions/llm-tool-call.js";
import { ToolExecutor } from "./actions/tool-executor.js";
import { WaitForSignal } from "./actions/wait-for-signal.js";
import { ToolRouter } from "./actions/tool-router.js";
import { StreamingSink } from "./decorators/streaming-sink.js";

/**
 * Register all standard built-in nodes to a registry
 * This includes composites, decorators, actions, conditions, and utilities
 *
 * @param registry - Registry to register nodes to
 *
 * @example
 * ```typescript
 * import { Registry, registerStandardNodes } from '@q1k-oss/behaviour-tree-workflows';
 *
 * const registry = new Registry();
 * registerStandardNodes(registry);
 *
 * // Now register your custom nodes
 * registry.register('MyCustomAction', MyCustomAction, { category: 'action' });
 * ```
 */
export function registerStandardNodes(registry: Registry): void {
  // Composites
  registry.register("Sequence", Sequence as any, { category: "composite" });
  registry.register("Selector", Selector as any, { category: "composite" });
  registry.register("Parallel", Parallel as any, { category: "composite" });
  registry.register("Conditional", Conditional as any, {
    category: "composite",
  });
  registry.register("ForEach", ForEach as any, { category: "composite" });
  registry.register("While", While as any, { category: "composite" });
  registry.register("Recovery", Recovery as any, { category: "composite" });
  registry.register("ReactiveSequence", ReactiveSequence as any, {
    category: "composite",
  });
  registry.register("MemorySequence", MemorySequence as any, {
    category: "composite",
  });
  registry.register("SubTree", SubTree as any, { category: "composite" });

  // Decorators
  registry.register("Timeout", Timeout as any, { category: "decorator" });
  registry.register("Delay", Delay as any, { category: "decorator" });
  registry.register("Repeat", Repeat as any, { category: "decorator" });
  registry.register("Invert", Invert as any, { category: "decorator" });
  registry.register("ForceSuccess", ForceSuccess as any, {
    category: "decorator",
  });
  registry.register("ForceFailure", ForceFailure as any, {
    category: "decorator",
  });
  registry.register("RunOnce", RunOnce as any, { category: "decorator" });
  registry.register("KeepRunningUntilFailure", KeepRunningUntilFailure as any, {
    category: "decorator",
  });
  registry.register("Precondition", Precondition as any, {
    category: "decorator",
  });
  registry.register("SoftAssert", SoftAssert as any, { category: "decorator" });

  // Test/Example nodes
  registry.register("PrintAction", PrintAction as any, { category: "action" });
  registry.register("MockAction", MockAction as any, { category: "action" });
  registry.register("SuccessNode", SuccessNode as any, { category: "action" });
  registry.register("FailureNode", FailureNode as any, { category: "action" });
  registry.register("RunningNode", RunningNode as any, { category: "action" });
  registry.register("CounterAction", CounterAction as any, {
    category: "action",
  });
  registry.register("CheckCondition", CheckCondition as any, {
    category: "condition",
  });
  registry.register("AlwaysCondition", AlwaysCondition as any, {
    category: "condition",
  });
  registry.register("WaitAction", WaitAction as any, { category: "action" });

  // Scripting - Script node removed, use CodeExecution instead

  // Utilities
  registry.register("LogMessage", LogMessage as any, { category: "action" });
  registry.register("RegexExtract", RegexExtract as any, { category: "action" });
  registry.register("SetVariable", SetVariable as any, { category: "action" });
  registry.register("MathOp", MathOp as any, { category: "action" });
  registry.register("ArrayFilter", ArrayFilter as any, { category: "action" });
  registry.register("Aggregate", Aggregate as any, { category: "action" });
  registry.register("ThresholdCheck", ThresholdCheck as any, { category: "action" });
  registry.register("DataTransform", DataTransform as any, { category: "action" });

  // Integrations
  registry.register("IntegrationAction", IntegrationAction as any, { category: "action" });

  // Activity-based action nodes (require activities in context)
  registry.register("PythonScript", PythonScript as any, { category: "action" });
  registry.register("ParseFile", ParseFile as any, { category: "action" });
  registry.register("GenerateFile", GenerateFile as any, { category: "action" });
  registry.register("HttpRequest", HttpRequest as any, { category: "action" });
  registry.register("CodeExecution", CodeExecution as any, { category: "action" });

  // AI-native action nodes
  registry.register("LLMChat", LLMChat as any, { category: "action" });
  registry.register("BrowserAgent", BrowserAgent as any, { category: "action" });
  registry.register("ClaudeAgent", ClaudeAgent as any, { category: "action" });

  // GitHub operations
  registry.register("GitHubAction", GitHubAction as any, { category: "action" });

  // Human-in-the-loop
  registry.register("HumanTask", HumanTask as any, { category: "action" });

  // Agent loop primitives
  registry.register("LLMToolCall", LLMToolCall as any, { category: "action" });
  registry.register("ToolExecutor", ToolExecutor as any, { category: "action" });
  registry.register("WaitForSignal", WaitForSignal as any, { category: "action" });
  registry.register("ToolRouter", ToolRouter as any, { category: "action" });
  registry.register("StreamingSink", StreamingSink as any, { category: "decorator" });
}
