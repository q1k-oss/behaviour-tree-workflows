/**
 * AI SDK-based implementation of the agentLoopTurn activity
 */

import { generateText, streamText, type ModelMessage } from "ai";
import type { ToolSet } from "ai";
import type {
  AgentLoopTurnRequest,
  AgentLoopTurnResult,
  AgentToolCall,
} from "../types.js";
import type { CreateAIActivitiesOptions } from "./types.js";
import { resolveModel } from "./provider-resolver.js";
import { mapAgentMessages } from "./message-mapper.js";
import { mapToolDefinitions } from "./tool-mapper.js";

/** Map AI SDK finish reasons to library stop reasons */
function mapStopReason(
  finishReason: string,
): AgentLoopTurnResult["stopReason"] {
  if (finishReason === "tool-calls") return "tool_use";
  if (finishReason === "length") return "max_tokens";
  return "end_turn";
}

/** Extract tool calls from AI SDK result */
function extractToolCalls(
  toolCalls?: Array<{ toolCallId: string; toolName: string; input: unknown }>,
): AgentToolCall[] | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;
  return toolCalls.map((tc) => ({
    id: tc.toolCallId,
    name: tc.toolName,
    input: tc.input as Record<string, unknown>,
  }));
}

/** Map AI SDK usage to library usage format */
function mapUsage(usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }) {
  return {
    promptTokens: usage?.inputTokens ?? 0,
    completionTokens: usage?.outputTokens ?? 0,
    totalTokens: usage?.totalTokens ?? (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
  };
}

/**
 * Create an agentLoopTurn activity function backed by the Vercel AI SDK.
 * Supports both streaming and non-streaming modes.
 *
 * Important: Does NOT set maxSteps — performs a single LLM turn only.
 * The behavior tree's While+LLMToolCall+ToolExecutor loop handles multi-turn.
 */
export function createAgentLoopTurnActivity(
  options: CreateAIActivitiesOptions,
): (request: AgentLoopTurnRequest) => Promise<AgentLoopTurnResult> {
  return async (
    request: AgentLoopTurnRequest,
  ): Promise<AgentLoopTurnResult> => {
    const model = resolveModel(
      options.providers,
      request.provider,
      request.model,
    );
    const messages = mapAgentMessages(request.messages, request.systemPrompt);
    const tools =
      request.tools && request.tools.length > 0
        ? mapToolDefinitions(request.tools)
        : undefined;

    // Streaming path
    if (request.streamChannelId && options.onStreamToken) {
      return executeWithStreaming(
        model,
        messages,
        tools,
        request,
        options,
      );
    }

    // Non-streaming path
    const result = await generateText({
      model,
      messages,
      tools,
      temperature: request.temperature,
      maxOutputTokens: request.maxTokens,
    });

    return {
      content: result.text,
      toolCalls: extractToolCalls(result.toolCalls as Array<{ toolCallId: string; toolName: string; input: unknown }>),
      stopReason: mapStopReason(result.finishReason),
      usage: mapUsage(result.usage),
    };
  };
}

async function executeWithStreaming(
  model: Parameters<typeof streamText>[0]["model"],
  messages: ModelMessage[],
  tools: ToolSet | undefined,
  request: AgentLoopTurnRequest,
  options: CreateAIActivitiesOptions,
): Promise<AgentLoopTurnResult> {
  const channelId = request.streamChannelId!;

  const result = streamText({
    model,
    messages,
    tools,
    temperature: request.temperature,
    maxOutputTokens: request.maxTokens,
  });

  // Stream tokens via callback
  for await (const chunk of result.textStream) {
    options.onStreamToken!(channelId, chunk);
  }

  // Signal completion
  options.onStreamComplete?.(channelId);

  // Get final result
  const finalText = await result.text;
  const finalToolCalls = await result.toolCalls;
  const finalFinishReason = await result.finishReason;
  const finalUsage = await result.usage;

  return {
    content: finalText,
    toolCalls: extractToolCalls(finalToolCalls as Array<{ toolCallId: string; toolName: string; input: unknown }>),
    stopReason: mapStopReason(finalFinishReason),
    usage: mapUsage(finalUsage),
  };
}
