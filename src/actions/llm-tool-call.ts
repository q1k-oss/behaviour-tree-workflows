/**
 * LLMToolCall Node
 *
 * Calls an LLM with tool support and manages the conversation message list.
 * This is the core node for the decomposed agent loop pattern.
 *
 * Unlike LLMChat (single-turn, text-only), LLMToolCall:
 * - Supports structured content blocks (text, tool_use, tool_result)
 * - Manages a persistent conversation on the blackboard
 * - Returns tool calls in the output for ToolExecutor to process
 * - Always returns SUCCESS (the calling tree decides what to do based on stopReason)
 */

import { ActionNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  type LLMProvider,
  type AgentMessage,
  type AgentToolDefinition,
  type AgentLoopTurnRequest,
  type AgentContentBlock,
  NodeStatus,
} from "../types.js";
import {
  resolveValue,
  type VariableContext,
} from "../utilities/variable-resolver.js";

/**
 * Configuration for LLMToolCall node
 */
export interface LLMToolCallConfig extends NodeConfiguration {
  /** LLM provider: anthropic, openai, google, ollama */
  provider: LLMProvider;
  /** Model identifier (supports ${bb.x} resolution) */
  model: string;
  /** Optional system prompt (supports variable resolution) */
  systemPrompt?: string;
  /** Blackboard key for AgentMessage[] conversation history */
  messagesKey: string;
  /** Blackboard key for a new user message to append before calling LLM */
  userMessageKey?: string;
  /** Blackboard key for AgentToolDefinition[] (dynamic tools) */
  toolsKey?: string;
  /** Static tool definitions (used if toolsKey is not set) */
  tools?: AgentToolDefinition[];
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Output key on blackboard for response */
  outputKey: string;
}

/**
 * LLMToolCall Node
 *
 * Calls an LLM with tool definitions, manages conversation state,
 * and writes the response (including any tool calls) to the blackboard.
 *
 * @example YAML
 * ```yaml
 * type: LLMToolCall
 * id: call-llm
 * props:
 *   provider: anthropic
 *   model: claude-sonnet-4-20250514
 *   systemPrompt: "You are a helpful assistant."
 *   messagesKey: conversationMessages
 *   userMessageKey: userMessage
 *   tools:
 *     - name: get_weather
 *       description: "Get weather for a city"
 *       inputSchema:
 *         type: object
 *         properties:
 *           city: { type: string }
 *         required: [city]
 *   outputKey: llmResponse
 * ```
 */
export class LLMToolCall extends ActionNode {
  private provider: LLMProvider;
  private model: string;
  private systemPrompt?: string;
  private messagesKey: string;
  private userMessageKey?: string;
  private toolsKey?: string;
  private tools?: AgentToolDefinition[];
  private temperature?: number;
  private maxTokens?: number;
  private outputKey: string;

  constructor(config: LLMToolCallConfig) {
    super(config);

    if (!config.provider) {
      throw new ConfigurationError("LLMToolCall requires provider");
    }
    if (!config.model) {
      throw new ConfigurationError("LLMToolCall requires model");
    }
    if (!config.messagesKey) {
      throw new ConfigurationError("LLMToolCall requires messagesKey");
    }
    if (!config.outputKey) {
      throw new ConfigurationError("LLMToolCall requires outputKey");
    }

    this.provider = config.provider;
    this.model = config.model;
    this.systemPrompt = config.systemPrompt;
    this.messagesKey = config.messagesKey;
    this.userMessageKey = config.userMessageKey;
    this.toolsKey = config.toolsKey;
    this.tools = config.tools;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
    this.outputKey = config.outputKey;
  }

  protected async executeTick(
    context: TemporalContext
  ): Promise<NodeStatus> {
    // 1. Validate activity
    if (!context.activities?.agentLoopTurn) {
      this._lastError =
        "LLMToolCall requires activities.agentLoopTurn to be configured.";
      this.log(`Error: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }

    try {
      // 2. Build variable context
      const varCtx: VariableContext = {
        blackboard: context.blackboard,
        input: context.input,
        testData: context.testData,
      };

      // 3. Read or initialize conversation messages
      let messages = (context.blackboard.get(this.messagesKey) as AgentMessage[]) || [];

      // 4. If userMessageKey is set and has a value, append as user message
      if (this.userMessageKey) {
        const userMsg = context.blackboard.get(this.userMessageKey);
        if (userMsg !== undefined && userMsg !== null) {
          const content = typeof userMsg === "string"
            ? userMsg
            : String(userMsg);
          messages = [...messages, { role: "user", content }];
          // Clear the key so it's not re-appended on next iteration
          context.blackboard.set(this.userMessageKey, null);
        }
      }

      // 5. Read tools from toolsKey or static config
      const tools = this.toolsKey
        ? (context.blackboard.get(this.toolsKey) as AgentToolDefinition[]) || []
        : this.tools || [];

      // 6. Resolve dynamic values
      const resolvedModel = resolveValue(this.model, varCtx) as string;
      const resolvedSystemPrompt = this.systemPrompt
        ? (resolveValue(this.systemPrompt, varCtx) as string)
        : undefined;

      // 7. Check for streaming channel
      const streamChannelId = context.blackboard.get("__streamChannelId") as string | undefined;

      // 8. Build request
      const request: AgentLoopTurnRequest = {
        provider: this.provider,
        model: resolvedModel,
        systemPrompt: resolvedSystemPrompt,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        streamChannelId: streamChannelId || undefined,
      };

      this.log(
        `LLMToolCall ${this.provider}/${resolvedModel} - ${messages.length} messages, ${tools.length} tools`
      );

      // 9. Execute via activity
      const result = await context.activities.agentLoopTurn(request);

      // 10. Append assistant response to conversation
      if (result.toolCalls && result.toolCalls.length > 0) {
        // Build content blocks: optional text + tool_use blocks
        const contentBlocks: AgentContentBlock[] = [];
        if (result.content) {
          contentBlocks.push({ type: "text", text: result.content });
        }
        for (const tc of result.toolCalls) {
          contentBlocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.input,
          });
        }
        messages = [...messages, { role: "assistant", content: contentBlocks }];
      } else {
        messages = [...messages, { role: "assistant", content: result.content }];
      }

      // 11. Write updated messages back
      context.blackboard.set(this.messagesKey, messages);

      // 12. Write result to outputKey
      context.blackboard.set(this.outputKey, {
        content: result.content,
        toolCalls: result.toolCalls,
        stopReason: result.stopReason,
        usage: result.usage,
      });

      this.log(
        `LLMToolCall completed: stopReason=${result.stopReason}, tools=${result.toolCalls?.length || 0}, tokens=${result.usage.totalTokens}`
      );

      return NodeStatus.SUCCESS;
    } catch (error) {
      this._lastError =
        error instanceof Error ? error.message : String(error);
      this.log(`LLMToolCall failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}
