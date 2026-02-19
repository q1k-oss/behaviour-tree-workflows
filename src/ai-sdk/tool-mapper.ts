/**
 * Maps AgentToolDefinition[] to AI SDK tool format
 */

import { tool, jsonSchema } from "ai";
import type { AgentToolDefinition } from "../types.js";
import type { JSONSchema7 } from "@ai-sdk/provider";

/**
 * Convert library tool definitions to AI SDK tool format.
 * Uses jsonSchema() to pass JSON Schema directly (no Zod conversion needed).
 *
 * Tools are created without an `execute` function — the behavior tree handles
 * tool execution via ToolExecutor, not the AI SDK.
 */
export function mapToolDefinitions(
  tools: AgentToolDefinition[],
): Record<string, ReturnType<typeof tool>> {
  const result: Record<string, ReturnType<typeof tool>> = {};

  for (const t of tools) {
    result[t.name] = tool({
      description: t.description,
      inputSchema: jsonSchema(t.inputSchema as JSONSchema7),
    });
  }

  return result;
}
