/**
 * LLMChat Node
 *
 * Executes LLM chat completion via a Temporal activity.
 * This node requires the `llmChat` activity to be configured in the context -
 * it does not support standalone/inline execution because LLM API calls require
 * capabilities outside the workflow sandbox.
 *
 * Features:
 * - Multi-provider support (Anthropic, OpenAI, Google, Ollama)
 * - Variable resolution in messages and system prompt
 * - JSON response format with schema validation
 * - Token usage tracking
 * - Result stored in blackboard
 */

import { ActionNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  type LLMProvider,
  type MessageRole,
  type LLMChatRequest,
  NodeStatus,
} from "../types.js";
import {
  resolveValue,
  type VariableContext,
} from "../utilities/variable-resolver.js";

/**
 * Configuration for LLMChat node
 */
export interface LLMChatConfig extends NodeConfiguration {
  /** LLM provider: anthropic, openai, google, ollama */
  provider: LLMProvider;
  /** Model identifier (supports ${bb.model} resolution) */
  model: string;
  /** Conversation messages (supports variable resolution in content) */
  messages: Array<{
    role: MessageRole;
    content: string;
  }>;
  /** Optional system prompt (supports variable resolution) */
  systemPrompt?: string;
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Response format */
  responseFormat?: "text" | "json";
  /** JSON schema for structured output */
  jsonSchema?: Record<string, unknown>;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Ollama base URL for local instance */
  baseUrl?: string;
  /** Output key on blackboard for response */
  outputKey: string;
}

/**
 * LLMChat Node
 *
 * Executes LLM chat completion via a Temporal activity and stores the response in blackboard.
 * Requires the `llmChat` activity to be configured.
 *
 * @example YAML - Basic Usage
 * ```yaml
 * type: LLMChat
 * id: summarize
 * props:
 *   provider: anthropic
 *   model: claude-sonnet-4-20250514
 *   systemPrompt: "You are a helpful assistant."
 *   messages:
 *     - role: user
 *       content: "Summarize: ${bb.documentText}"
 *   temperature: 0.7
 *   maxTokens: 1000
 *   outputKey: summary
 * ```
 *
 * @example YAML - JSON Response
 * ```yaml
 * type: LLMChat
 * id: extract-entities
 * props:
 *   provider: openai
 *   model: gpt-4
 *   messages:
 *     - role: user
 *       content: "Extract entities from: ${bb.text}"
 *   responseFormat: json
 *   jsonSchema:
 *     type: object
 *     properties:
 *       people: { type: array, items: { type: string } }
 *       organizations: { type: array, items: { type: string } }
 *   outputKey: entities
 * ```
 */
export class LLMChat extends ActionNode {
  private provider: LLMProvider;
  private model: string;
  private messages: Array<{ role: MessageRole; content: string }>;
  private systemPrompt?: string;
  private temperature?: number;
  private maxTokens?: number;
  private responseFormat: "text" | "json";
  private jsonSchema?: Record<string, unknown>;
  private timeout?: number;
  private baseUrl?: string;
  private outputKey: string;

  constructor(config: LLMChatConfig) {
    super(config);

    if (!config.provider) {
      throw new ConfigurationError("LLMChat requires provider");
    }

    if (!config.model) {
      throw new ConfigurationError("LLMChat requires model");
    }

    if (!config.messages || config.messages.length === 0) {
      throw new ConfigurationError(
        "LLMChat requires at least one message"
      );
    }

    if (!config.outputKey) {
      throw new ConfigurationError("LLMChat requires outputKey");
    }

    this.provider = config.provider;
    this.model = config.model;
    this.messages = config.messages;
    this.systemPrompt = config.systemPrompt;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
    this.responseFormat = config.responseFormat || "text";
    this.jsonSchema = config.jsonSchema;
    this.timeout = config.timeout;
    this.baseUrl = config.baseUrl;
    this.outputKey = config.outputKey;
  }

  protected async executeTick(
    context: TemporalContext
  ): Promise<NodeStatus> {
    // 1. Validate activity is available
    if (!context.activities?.llmChat) {
      this._lastError =
        "LLMChat requires activities.llmChat to be configured. " +
        "This activity handles LLM API calls outside the workflow sandbox.";
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

      // 3. Resolve variables in messages
      const resolvedMessages = this.messages.map((msg) => ({
        role: msg.role,
        content: resolveValue(msg.content, varCtx) as string,
      }));

      // 4. Resolve optional system prompt
      const resolvedSystemPrompt = this.systemPrompt
        ? (resolveValue(this.systemPrompt, varCtx) as string)
        : undefined;

      // 5. Resolve model (could be dynamic)
      const resolvedModel = resolveValue(this.model, varCtx) as string;

      // 6. Build request
      const request: LLMChatRequest = {
        provider: this.provider,
        model: resolvedModel,
        messages: resolvedMessages,
        systemPrompt: resolvedSystemPrompt,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        responseFormat: this.responseFormat,
        jsonSchema: this.jsonSchema,
        timeout: this.timeout,
        baseUrl: this.baseUrl,
      };

      this.log(
        `LLM ${this.provider}/${resolvedModel} - ${resolvedMessages.length} messages`
      );

      // 7. Execute via activity
      const result = await context.activities.llmChat(request);

      // 8. Store result in blackboard
      context.blackboard.set(this.outputKey, result);

      // 9. Check for LLM-level errors
      if (result.finishReason === "error") {
        this._lastError = `LLM returned error: ${result.content}`;
        this.log(`Error: ${this._lastError}`);
        return NodeStatus.FAILURE;
      }

      this.log(
        `LLM ${this.provider}/${resolvedModel} completed: ${result.usage.totalTokens} tokens, finish: ${result.finishReason}`
      );

      return NodeStatus.SUCCESS;
    } catch (error) {
      // Handle activity errors (network, timeout, rate limit, etc.)
      this._lastError =
        error instanceof Error ? error.message : String(error);
      this.log(`LLM chat failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}
