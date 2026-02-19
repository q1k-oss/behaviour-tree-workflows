/**
 * Maps between the library's message types and AI SDK's ModelMessage format.
 *
 * Key translation:
 * - Library uses Anthropic-style content blocks (tool_result as user role)
 * - AI SDK uses a dedicated "tool" role for tool results
 */

import type { ModelMessage, ToolResultPart } from "ai";
import type { LLMMessage, AgentMessage, AgentContentBlock } from "../types.js";

/**
 * Map simple LLMMessage[] to AI SDK ModelMessage[].
 * Used by the llmChat activity for basic completions.
 */
export function mapLLMMessages(
  messages: LLMMessage[],
  systemPrompt?: string,
): ModelMessage[] {
  const result: ModelMessage[] = [];

  if (systemPrompt) {
    result.push({ role: "system", content: systemPrompt });
  }

  for (const msg of messages) {
    // Skip system messages if we already added systemPrompt
    if (msg.role === "system" && systemPrompt) continue;
    result.push({ role: msg.role, content: msg.content });
  }

  return result;
}

/**
 * Map AgentMessage[] (with structured content blocks) to AI SDK ModelMessage[].
 * Used by the agentLoopTurn activity for tool-calling conversations.
 *
 * Handles the key format difference:
 * - Library: tool_result blocks sent as { role: "user", content: [{ type: "tool_result", ... }] }
 * - AI SDK: tool results sent as { role: "tool", content: [{ type: "tool-result", ... }] }
 */
export function mapAgentMessages(
  messages: AgentMessage[],
  systemPrompt?: string,
): ModelMessage[] {
  const result: ModelMessage[] = [];

  if (systemPrompt) {
    result.push({ role: "system", content: systemPrompt });
  }

  for (const msg of messages) {
    if (msg.role === "system") {
      if (!systemPrompt) {
        result.push({ role: "system", content: msg.content as string });
      }
      continue;
    }

    // Simple text message
    if (typeof msg.content === "string") {
      result.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
      continue;
    }

    // Structured content blocks
    const blocks = msg.content;

    if (msg.role === "assistant") {
      mapAssistantMessage(blocks, result);
    } else if (msg.role === "user") {
      mapUserMessage(blocks, result);
    }
  }

  return result;
}

/**
 * Map assistant message with text + tool_use blocks
 */
function mapAssistantMessage(
  blocks: AgentContentBlock[],
  result: ModelMessage[],
): void {
  const contentParts: Array<
    | { type: "text"; text: string }
    | { type: "tool-call"; toolCallId: string; toolName: string; input: Record<string, unknown> }
  > = [];

  for (const block of blocks) {
    if (block.type === "text") {
      contentParts.push({ type: "text", text: block.text });
    } else if (block.type === "tool_use") {
      contentParts.push({
        type: "tool-call",
        toolCallId: block.id,
        toolName: block.name,
        input: block.input,
      });
    }
  }

  if (contentParts.length > 0) {
    result.push({ role: "assistant", content: contentParts });
  }
}

/**
 * Map user message — may contain tool_result blocks or text blocks.
 * tool_result blocks become AI SDK "tool" role messages.
 */
function mapUserMessage(
  blocks: AgentContentBlock[],
  result: ModelMessage[],
): void {
  const toolResults = blocks.filter(
    (b): b is Extract<AgentContentBlock, { type: "tool_result" }> =>
      b.type === "tool_result",
  );

  if (toolResults.length > 0) {
    const toolResultParts: ToolResultPart[] = toolResults.map((b) => ({
      type: "tool-result" as const,
      toolCallId: b.tool_use_id,
      toolName: b.tool_use_id, // AI SDK v6 requires toolName; use toolCallId as fallback
      output: b.is_error
        ? { type: "error-text" as const, value: b.content }
        : { type: "text" as const, value: b.content },
    }));
    result.push({ role: "tool", content: toolResultParts });
  } else {
    // Regular user message with text blocks
    const text = blocks
      .filter(
        (b): b is Extract<AgentContentBlock, { type: "text" }> =>
          b.type === "text",
      )
      .map((b) => b.text)
      .join("\n");
    result.push({ role: "user", content: text });
  }
}
