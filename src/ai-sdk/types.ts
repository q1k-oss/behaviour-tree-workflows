/**
 * Configuration types for the AI SDK activity factory
 */

import type { LanguageModel } from "ai";

/**
 * Provider configuration — maps provider names to AI SDK model factories.
 * Each entry is a function that takes a model ID and returns a LanguageModel.
 *
 * @example
 * ```typescript
 * import { createAnthropic } from "@ai-sdk/anthropic";
 * import { createOpenAI } from "@ai-sdk/openai";
 *
 * const providers: AIProviderConfig = {
 *   anthropic: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
 *   openai: createOpenAI({ apiKey: process.env.OPENAI_API_KEY }),
 * };
 * ```
 */
export interface AIProviderConfig {
  anthropic?: (modelId: string) => LanguageModel;
  openai?: (modelId: string) => LanguageModel;
  google?: (modelId: string) => LanguageModel;
  ollama?: (modelId: string) => LanguageModel;
}

/**
 * Options for creating AI SDK-based activity implementations
 */
export interface CreateAIActivitiesOptions {
  /** Provider configuration — maps provider names to AI SDK model factories */
  providers: AIProviderConfig;
  /** Default timeout for LLM calls in milliseconds (default: 60000) */
  defaultTimeout?: number;
  /** Callback for streaming tokens — receives (channelId, textDelta) */
  onStreamToken?: (channelId: string, textDelta: string) => void;
  /** Callback when stream completes */
  onStreamComplete?: (channelId: string) => void;
}
