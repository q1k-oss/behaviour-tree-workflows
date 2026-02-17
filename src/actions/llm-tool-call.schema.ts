/**
 * Zod schema for LLMToolCall node configuration
 */

import { z } from "zod";
import { createNodeSchema } from "../schemas/base.schema.js";

const toolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.record(z.string(), z.unknown()),
});

export const llmToolCallSchema = createNodeSchema("LLMToolCall", {
  provider: z.enum(["anthropic", "openai", "google", "ollama"]),
  model: z.string().min(1, "Model is required"),
  systemPrompt: z.string().optional(),
  messagesKey: z.string().min(1, "messagesKey is required"),
  userMessageKey: z.string().optional(),
  toolsKey: z.string().optional(),
  tools: z.array(toolDefinitionSchema).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  outputKey: z.string().min(1, "outputKey is required"),
});

export type LLMToolCallSchemaType = z.infer<typeof llmToolCallSchema>;
