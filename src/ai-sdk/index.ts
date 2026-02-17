/**
 * AI SDK Activity Factory
 *
 * Creates BtreeActivities implementations for `llmChat` and `agentLoopTurn`
 * backed by the Vercel AI SDK. Supports Anthropic, OpenAI, Google, and Ollama.
 *
 * @example
 * ```typescript
 * import { createAIActivities } from "@q1k-oss/behaviour-tree-workflows/ai-sdk";
 * import { createAnthropic } from "@ai-sdk/anthropic";
 * import { createOpenAI } from "@ai-sdk/openai";
 *
 * const aiActivities = createAIActivities({
 *   providers: {
 *     anthropic: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
 *     openai: createOpenAI({ apiKey: process.env.OPENAI_API_KEY }),
 *   },
 *   onStreamToken: (channelId, text) => {
 *     ws.send(JSON.stringify({ channel: channelId, text }));
 *   },
 * });
 *
 * // Merge with other activities
 * const activities: BtreeActivities = {
 *   ...aiActivities,
 *   executeAgentTool: myToolExecutor,
 * };
 * ```
 */

import type { BtreeActivities } from "../types.js";
import type { CreateAIActivitiesOptions } from "./types.js";
import { createLLMChatActivity } from "./llm-chat-activity.js";
import { createAgentLoopTurnActivity } from "./agent-loop-turn-activity.js";

export type { AIProviderConfig, CreateAIActivitiesOptions } from "./types.js";

/**
 * Create AI SDK-based activity implementations for behavior tree LLM nodes.
 *
 * Returns a partial BtreeActivities object with `llmChat` and `agentLoopTurn`
 * implemented using the Vercel AI SDK. Other activities (executeAgentTool,
 * executePieceAction, etc.) must be provided separately.
 */
export function createAIActivities(
  options: CreateAIActivitiesOptions,
): Required<Pick<BtreeActivities, "llmChat" | "agentLoopTurn">> {
  return {
    llmChat: createLLMChatActivity(options),
    agentLoopTurn: createAgentLoopTurnActivity(options),
  };
}
