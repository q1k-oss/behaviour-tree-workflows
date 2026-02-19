/**
 * AI SDK-based implementation of the llmChat activity
 */

import { generateText, generateObject } from "ai";
import { jsonSchema } from "ai";
import type { LLMChatRequest, LLMChatResult } from "../types.js";
import type { CreateAIActivitiesOptions } from "./types.js";
import { resolveModel } from "./provider-resolver.js";
import { mapLLMMessages } from "./message-mapper.js";

/** Map AI SDK finish reasons to library finish reasons */
const FINISH_REASON_MAP: Record<string, LLMChatResult["finishReason"]> = {
  stop: "stop",
  length: "length",
  "content-filter": "content_filter",
  "tool-calls": "tool_calls",
  error: "error",
};

/** Map AI SDK usage to library usage format */
function mapUsage(usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }) {
  return {
    promptTokens: usage?.inputTokens ?? 0,
    completionTokens: usage?.outputTokens ?? 0,
    totalTokens: usage?.totalTokens ?? (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
  };
}

/**
 * Create a llmChat activity function backed by the Vercel AI SDK.
 */
export function createLLMChatActivity(
  options: CreateAIActivitiesOptions,
): (request: LLMChatRequest) => Promise<LLMChatResult> {
  return async (request: LLMChatRequest): Promise<LLMChatResult> => {
    const model = resolveModel(options.providers, request.provider, request.model);
    const messages = mapLLMMessages(request.messages, request.systemPrompt);

    const timeout = request.timeout ?? options.defaultTimeout ?? 60000;
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), timeout);

    try {
      // Use generateObject for JSON mode with schema
      if (request.responseFormat === "json" && request.jsonSchema) {
        const result = await generateObject({
          model,
          messages,
          schema: jsonSchema(request.jsonSchema as Parameters<typeof jsonSchema>[0]),
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens,
          abortSignal: abortController.signal,
        });

        return {
          content: JSON.stringify(result.object),
          parsed: result.object,
          usage: mapUsage(result.usage),
          model: request.model,
          finishReason: FINISH_REASON_MAP[result.finishReason] ?? "stop",
        };
      }

      // Use generateText for text completion (and JSON without schema)
      const result = await generateText({
        model,
        messages,
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        abortSignal: abortController.signal,
      });

      let parsed: unknown;
      if (request.responseFormat === "json") {
        try {
          parsed = JSON.parse(result.text);
        } catch {
          // Leave parsed as undefined if JSON parsing fails
        }
      }

      return {
        content: result.text,
        parsed,
        usage: mapUsage(result.usage),
        model: request.model,
        finishReason: FINISH_REASON_MAP[result.finishReason] ?? "stop",
      };
    } finally {
      clearTimeout(timer);
    }
  };
}
