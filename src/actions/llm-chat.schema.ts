/**
 * Zod schema for LLMChat node configuration
 * Validates YAML/JSON configuration for LLM chat completion
 */

import { z } from "zod";
import { createNodeSchema } from "../schemas/base.schema.js";

/**
 * Schema for a single message in the conversation
 */
const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1, "Message content cannot be empty"),
});

/**
 * LLMChat node configuration schema
 *
 * @example YAML
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
 */
export const llmChatSchema = createNodeSchema("LLMChat", {
  provider: z.enum(["anthropic", "openai", "google", "ollama"]),
  model: z.string().min(1, "Model is required"),
  messages: z.array(messageSchema).min(1, "At least one message is required"),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  responseFormat: z.enum(["text", "json"]).optional().default("text"),
  jsonSchema: z.record(z.string(), z.unknown()).optional(),
  timeout: z.number().int().positive().optional().default(60000),
  baseUrl: z.string().url().optional(),
  outputKey: z.string().min(1, "outputKey is required"),
});

export type LLMChatSchemaType = z.infer<typeof llmChatSchema>;
