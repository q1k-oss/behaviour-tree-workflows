/**
 * ToolRouter Node
 *
 * Dynamically selects which tools to expose to the LLM based on
 * intent matching or explicit rules. Writes the selected tool
 * definitions to a blackboard key that LLMToolCall reads via toolsKey.
 *
 * Use cases:
 * - Limit tools based on current agent phase (research vs action)
 * - Select tools based on user intent classification
 * - Reduce token usage by only sending relevant tools
 */

import { ActionNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  type AgentToolDefinition,
  NodeStatus,
} from "../types.js";
import {
  resolveValue,
  type VariableContext,
} from "../utilities/variable-resolver.js";

/**
 * Rule for matching intent to tool sets
 */
export interface ToolRouterRule {
  /** Regex pattern to match against intent */
  pattern: string;
  /** Tool set names to include when pattern matches */
  toolSets: string[];
}

/**
 * Configuration for ToolRouter node
 */
export interface ToolRouterConfig extends NodeConfiguration {
  /** Blackboard key for intent string to match against rules */
  intentKey: string;
  /** Named groups of tool definitions */
  toolSets: Record<string, AgentToolDefinition[]>;
  /** Tool set names that are always included */
  defaultTools?: string[];
  /** Rules: regex patterns mapped to tool set names */
  rules?: ToolRouterRule[];
  /** Blackboard key to write selected tools */
  outputKey: string;
}

/**
 * ToolRouter Node
 *
 * Selects tools based on intent matching and writes them to the blackboard.
 *
 * @example YAML
 * ```yaml
 * type: ToolRouter
 * id: select-tools
 * props:
 *   intentKey: userIntent
 *   toolSets:
 *     weather:
 *       - name: get_weather
 *         description: "Get weather for a city"
 *         inputSchema: { type: object, properties: { city: { type: string } } }
 *     math:
 *       - name: calculate
 *         description: "Evaluate a math expression"
 *         inputSchema: { type: object, properties: { expression: { type: string } } }
 *     time:
 *       - name: get_time
 *         description: "Get current time"
 *         inputSchema: { type: object, properties: { timezone: { type: string } } }
 *   defaultTools: [time]
 *   rules:
 *     - pattern: "weather|forecast|temperature"
 *       toolSets: [weather]
 *     - pattern: "calc|math|compute"
 *       toolSets: [math]
 *   outputKey: selectedTools
 * ```
 */
export class ToolRouter extends ActionNode {
  private intentKey: string;
  private toolSets: Record<string, AgentToolDefinition[]>;
  private defaultTools: string[];
  private rules: ToolRouterRule[];
  private outputKey: string;

  constructor(config: ToolRouterConfig) {
    super(config);

    if (!config.intentKey) {
      throw new ConfigurationError("ToolRouter requires intentKey");
    }
    if (!config.toolSets || Object.keys(config.toolSets).length === 0) {
      throw new ConfigurationError("ToolRouter requires at least one toolSet");
    }
    if (!config.outputKey) {
      throw new ConfigurationError("ToolRouter requires outputKey");
    }

    this.intentKey = config.intentKey;
    this.toolSets = config.toolSets;
    this.defaultTools = config.defaultTools || [];
    this.rules = config.rules || [];
    this.outputKey = config.outputKey;
  }

  protected async executeTick(
    context: TemporalContext
  ): Promise<NodeStatus> {
    try {
      const varCtx: VariableContext = {
        blackboard: context.blackboard,
        input: context.input,
        testData: context.testData,
      };

      // 1. Read intent from blackboard
      const intentRaw = context.blackboard.get(this.intentKey);
      const intent = typeof intentRaw === "string" ? intentRaw : "";

      // 2. Start with default tool sets
      const selectedSetNames = new Set<string>(this.defaultTools);

      // 3. Apply rules
      for (const rule of this.rules) {
        const regex = new RegExp(rule.pattern, "i");
        if (regex.test(intent)) {
          for (const setName of rule.toolSets) {
            selectedSetNames.add(setName);
          }
        }
      }

      // 4. Gather tools from selected sets, deduplicate by name
      const toolsByName = new Map<string, AgentToolDefinition>();
      for (const setName of selectedSetNames) {
        const tools = this.toolSets[setName];
        if (tools) {
          for (const tool of tools) {
            if (!toolsByName.has(tool.name)) {
              toolsByName.set(tool.name, tool);
            }
          }
        }
      }

      const selectedTools = Array.from(toolsByName.values());

      // 5. Write to blackboard
      context.blackboard.set(this.outputKey, selectedTools);

      this.log(
        `Selected ${selectedTools.length} tools from sets [${Array.from(selectedSetNames).join(", ")}] for intent "${intent.substring(0, 50)}"`
      );

      return NodeStatus.SUCCESS;
    } catch (error) {
      this._lastError =
        error instanceof Error ? error.message : String(error);
      this.log(`ToolRouter failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}
