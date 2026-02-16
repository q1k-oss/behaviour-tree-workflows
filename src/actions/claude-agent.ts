/**
 * ClaudeAgent Node
 *
 * Executes an autonomous Claude agent via a Temporal activity.
 * This node requires the `claudeAgent` activity to be configured in the context -
 * it does not support standalone/inline execution because agent execution requires
 * capabilities outside the workflow sandbox.
 *
 * Features:
 * - Goal-driven autonomous coding agent (powered by Claude Agent SDK)
 * - Configurable tools, permissions, and cost limits
 * - MCP server integration for external tools
 * - Subagent support for delegating specialized tasks
 * - Variable resolution in prompt, systemPrompt, model, and cwd
 * - Session ID returned for resuming/continuing agent conversations
 * - Result stored in blackboard
 */

import { ActionNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  type ClaudeAgentRequest,
  type ClaudeAgentMcpServerConfig,
  type ClaudeAgentSubagent,
  NodeStatus,
} from "../types.js";
import {
  resolveValue,
  type VariableContext,
} from "../utilities/variable-resolver.js";

/**
 * Configuration for ClaudeAgent node
 */
export interface ClaudeAgentConfig extends NodeConfiguration {
  /** Task prompt for the agent (supports variable resolution) */
  prompt: string;
  /** Model to use, e.g. "claude-sonnet-4-5-20250929" (supports variable resolution) */
  model?: string;
  /** System prompt for agent behavior (supports variable resolution) */
  systemPrompt?: string;
  /** Tools the agent can use (e.g., ["Read", "Write", "Edit", "Bash"]) */
  allowedTools?: string[];
  /** Permission mode: default, acceptEdits, bypassPermissions */
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions";
  /** Maximum conversation turns */
  maxTurns?: number;
  /** Maximum budget in USD */
  maxBudgetUsd?: number;
  /** Working directory for the agent (supports variable resolution) */
  cwd?: string;
  /** MCP server configurations */
  mcpServers?: Record<string, ClaudeAgentMcpServerConfig>;
  /** Subagent definitions */
  agents?: Record<string, ClaudeAgentSubagent>;
  /** Output key on blackboard for result */
  outputKey: string;
}

/**
 * ClaudeAgent Node
 *
 * Executes an autonomous Claude agent via the Claude Agent SDK and stores
 * the result in blackboard. Requires the `claudeAgent` activity to be configured.
 *
 * @example YAML - Basic coding task
 * ```yaml
 * type: ClaudeAgent
 * id: implement-feature
 * props:
 *   prompt: "Add unit tests for the auth module"
 *   allowedTools: [Read, Write, Edit, Bash, Glob, Grep]
 *   permissionMode: acceptEdits
 *   outputKey: agentResult
 * ```
 *
 * @example YAML - Dev workflow with PR creation
 * ```yaml
 * type: ClaudeAgent
 * id: dev-task
 * props:
 *   prompt: "${bb.taskDescription}"
 *   systemPrompt: |
 *     You are working on @wayfarer-ai/btree-workflows.
 *     Read CLAUDE.md for project conventions.
 *     Create a branch, implement changes, commit, push, and create a PR.
 *   allowedTools: [Read, Write, Edit, Bash, Glob, Grep]
 *   permissionMode: acceptEdits
 *   maxTurns: 100
 *   maxBudgetUsd: 10.0
 *   outputKey: agentResult
 * ```
 */
export class ClaudeAgent extends ActionNode {
  private prompt: string;
  private model?: string;
  private systemPrompt?: string;
  private allowedTools?: string[];
  private permissionMode: "default" | "acceptEdits" | "bypassPermissions";
  private maxTurns: number;
  private maxBudgetUsd?: number;
  private agentCwd?: string;
  private mcpServers?: Record<string, ClaudeAgentMcpServerConfig>;
  private agents?: Record<string, ClaudeAgentSubagent>;
  private outputKey: string;

  constructor(config: ClaudeAgentConfig) {
    super(config);

    if (!config.prompt) {
      throw new ConfigurationError("ClaudeAgent requires prompt");
    }

    if (!config.outputKey) {
      throw new ConfigurationError("ClaudeAgent requires outputKey");
    }

    this.prompt = config.prompt;
    this.model = config.model;
    this.systemPrompt = config.systemPrompt;
    this.allowedTools = config.allowedTools;
    this.permissionMode = config.permissionMode ?? "default";
    this.maxTurns = config.maxTurns ?? 50;
    this.maxBudgetUsd = config.maxBudgetUsd;
    this.agentCwd = config.cwd;
    this.mcpServers = config.mcpServers;
    this.agents = config.agents;
    this.outputKey = config.outputKey;
  }

  protected async executeTick(
    context: TemporalContext
  ): Promise<NodeStatus> {
    // 1. Validate activity is available
    if (!context.activities?.claudeAgent) {
      this._lastError =
        "ClaudeAgent requires activities.claudeAgent to be configured. " +
        "This activity handles autonomous agent execution via the Claude Agent SDK.";
      this.log(`Error: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }

    try {
      // 2. Build variable context for resolution
      const varCtx: VariableContext = {
        blackboard: context.blackboard,
        input: context.input,
        testData: context.testData,
      };

      // 3. Resolve variables in prompt
      const resolvedPrompt = resolveValue(this.prompt, varCtx) as string;

      // 4. Resolve optional system prompt
      const resolvedSystemPrompt = this.systemPrompt
        ? (resolveValue(this.systemPrompt, varCtx) as string)
        : undefined;

      // 5. Resolve model (could be dynamic)
      const resolvedModel = this.model
        ? (resolveValue(this.model, varCtx) as string)
        : undefined;

      // 6. Resolve cwd
      const resolvedCwd = this.agentCwd
        ? (resolveValue(this.agentCwd, varCtx) as string)
        : undefined;

      // 7. Build request
      const request: ClaudeAgentRequest = {
        prompt: resolvedPrompt,
        model: resolvedModel,
        systemPrompt: resolvedSystemPrompt,
        allowedTools: this.allowedTools,
        permissionMode: this.permissionMode,
        maxTurns: this.maxTurns,
        maxBudgetUsd: this.maxBudgetUsd,
        cwd: resolvedCwd,
        mcpServers: this.mcpServers,
        agents: this.agents,
      };

      this.log(
        `Claude agent: ${resolvedPrompt.substring(0, 80)}${resolvedPrompt.length > 80 ? "..." : ""}`
      );

      // 8. Execute via activity
      const result = await context.activities.claudeAgent(request);

      // 9. Store result in blackboard
      context.blackboard.set(this.outputKey, result);

      // 10. Check agent success
      if (!result.success) {
        this._lastError = `Claude agent failed: ${result.errors?.join(", ") || "unknown error"}`;
        this.log(`Error: ${this._lastError}`);
        return NodeStatus.FAILURE;
      }

      this.log(
        `Claude agent completed in ${result.numTurns} turns, ` +
        `$${result.totalCostUsd.toFixed(4)}, ${result.durationMs}ms`
      );

      return NodeStatus.SUCCESS;
    } catch (error) {
      // Handle activity errors (API, network, timeout, etc.)
      this._lastError =
        error instanceof Error ? error.message : String(error);
      this.log(`Claude agent failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}
