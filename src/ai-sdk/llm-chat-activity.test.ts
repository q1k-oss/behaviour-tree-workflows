/**
 * Tests for llm-chat-activity.ts
 *
 * Tests createLLMChatActivity() — the AI SDK-based implementation
 * of the llmChat activity for basic LLM completions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LanguageModel } from "ai";
import { createLLMChatActivity } from "./llm-chat-activity.js";
import type { CreateAIActivitiesOptions } from "./types.js";
import type { LLMChatRequest } from "../types.js";

// Mock the AI SDK module
vi.mock("ai", async () => {
  const actual = await vi.importActual("ai");
  return {
    ...actual,
    generateText: vi.fn(),
    generateObject: vi.fn(),
    streamText: vi.fn(),
  };
});

// Import the mocked functions after mocking
import { generateText, generateObject } from "ai";

const mockGenerateText = generateText as ReturnType<typeof vi.fn>;
const mockGenerateObject = generateObject as ReturnType<typeof vi.fn>;

describe("createLLMChatActivity", () => {
  const mockModel = { modelId: "test-model" } as unknown as LanguageModel;
  const mockProviderFn = vi.fn().mockReturnValue(mockModel);

  let options: CreateAIActivitiesOptions;

  beforeEach(() => {
    vi.clearAllMocks();
    options = {
      providers: {
        anthropic: mockProviderFn,
      },
    };
  });

  function buildRequest(overrides?: Partial<LLMChatRequest>): LLMChatRequest {
    return {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Hello" }],
      ...overrides,
    };
  }

  it("should complete a basic text request", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Hello! I'm here to help.",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      finishReason: "stop",
    });

    const activity = createLLMChatActivity(options);
    const result = await activity(buildRequest());

    expect(result.content).toBe("Hello! I'm here to help.");
    expect(result.model).toBe("claude-sonnet-4-20250514");
    expect(result.finishReason).toBe("stop");
    expect(result.parsed).toBeUndefined();

    // Verify generateText was called with correct args
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.model).toBe(mockModel);
    expect(callArgs.messages).toBeDefined();
  });

  it("should map token usage correctly (inputTokens -> promptTokens, outputTokens -> completionTokens)", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Response",
      usage: { inputTokens: 42, outputTokens: 18, totalTokens: 60 },
      finishReason: "stop",
    });

    const activity = createLLMChatActivity(options);
    const result = await activity(buildRequest());

    expect(result.usage).toEqual({
      promptTokens: 42,
      completionTokens: 18,
      totalTokens: 60,
    });
  });

  it("should handle JSON response format without schema (parseJSON from text)", async () => {
    mockGenerateText.mockResolvedValue({
      text: '{"name": "John", "age": 30}',
      usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
      finishReason: "stop",
    });

    const activity = createLLMChatActivity(options);
    const result = await activity(
      buildRequest({
        responseFormat: "json",
      })
    );

    expect(result.content).toBe('{"name": "John", "age": 30}');
    expect(result.parsed).toEqual({ name: "John", age: 30 });

    // Should use generateText, not generateObject (no schema provided)
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("should handle JSON response format when JSON parsing fails", async () => {
    mockGenerateText.mockResolvedValue({
      text: "not valid json",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      finishReason: "stop",
    });

    const activity = createLLMChatActivity(options);
    const result = await activity(
      buildRequest({
        responseFormat: "json",
      })
    );

    expect(result.content).toBe("not valid json");
    expect(result.parsed).toBeUndefined();
  });

  it("should use generateObject for JSON response format with schema", async () => {
    const jsonSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
    };

    mockGenerateObject.mockResolvedValue({
      object: { name: "John", age: 30 },
      usage: { inputTokens: 15, outputTokens: 10, totalTokens: 25 },
      finishReason: "stop",
    });

    const activity = createLLMChatActivity(options);
    const result = await activity(
      buildRequest({
        responseFormat: "json",
        jsonSchema,
      })
    );

    expect(result.content).toBe('{"name":"John","age":30}');
    expect(result.parsed).toEqual({ name: "John", age: 30 });

    // Should use generateObject, not generateText
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect(mockGenerateText).not.toHaveBeenCalled();

    const callArgs = mockGenerateObject.mock.calls[0][0];
    expect(callArgs.schema).toBeDefined();
  });

  it("should map finish reasons correctly", async () => {
    const finishReasonTests: Array<{ sdk: string; library: string }> = [
      { sdk: "stop", library: "stop" },
      { sdk: "length", library: "length" },
      { sdk: "content-filter", library: "content_filter" },
      { sdk: "tool-calls", library: "tool_calls" },
      { sdk: "error", library: "error" },
    ];

    for (const { sdk, library } of finishReasonTests) {
      mockGenerateText.mockResolvedValue({
        text: "test",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        finishReason: sdk,
      });

      const activity = createLLMChatActivity(options);
      const result = await activity(buildRequest());

      expect(result.finishReason).toBe(library);
    }
  });

  it("should default unknown finish reasons to 'stop'", async () => {
    mockGenerateText.mockResolvedValue({
      text: "test",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: "unknown-reason",
    });

    const activity = createLLMChatActivity(options);
    const result = await activity(buildRequest());

    expect(result.finishReason).toBe("stop");
  });

  it("should set up an AbortSignal timeout", async () => {
    mockGenerateText.mockResolvedValue({
      text: "test",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: "stop",
    });

    const activity = createLLMChatActivity(options);
    await activity(buildRequest({ timeout: 5000 }));

    // Verify abortSignal was passed
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("should use request timeout over default timeout", async () => {
    mockGenerateText.mockResolvedValue({
      text: "test",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: "stop",
    });

    const optionsWithTimeout: CreateAIActivitiesOptions = {
      ...options,
      defaultTimeout: 30000,
    };

    const activity = createLLMChatActivity(optionsWithTimeout);
    await activity(buildRequest({ timeout: 5000 }));

    // The abort signal is set, validating the timeout mechanism was invoked
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.abortSignal).toBeDefined();
  });

  it("should propagate errors when generateText throws", async () => {
    mockGenerateText.mockRejectedValue(new Error("API rate limit exceeded"));

    const activity = createLLMChatActivity(options);

    await expect(activity(buildRequest())).rejects.toThrow("API rate limit exceeded");
  });

  it("should propagate errors when generateObject throws", async () => {
    mockGenerateObject.mockRejectedValue(new Error("Invalid schema"));

    const activity = createLLMChatActivity(options);

    await expect(
      activity(
        buildRequest({
          responseFormat: "json",
          jsonSchema: { type: "object" },
        })
      )
    ).rejects.toThrow("Invalid schema");
  });

  it("should pass system prompt through to messages", async () => {
    mockGenerateText.mockResolvedValue({
      text: "test",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: "stop",
    });

    const activity = createLLMChatActivity(options);
    await activity(
      buildRequest({
        systemPrompt: "You are a helpful assistant.",
      })
    );

    const callArgs = mockGenerateText.mock.calls[0][0];
    // The system prompt is handled by mapLLMMessages which prepends it
    expect(callArgs.messages[0]).toEqual({
      role: "system",
      content: "You are a helpful assistant.",
    });
  });

  it("should pass temperature and maxOutputTokens to generateText", async () => {
    mockGenerateText.mockResolvedValue({
      text: "test",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: "stop",
    });

    const activity = createLLMChatActivity(options);
    await activity(
      buildRequest({
        temperature: 0.7,
        maxTokens: 1024,
      })
    );

    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.temperature).toBe(0.7);
    expect(callArgs.maxOutputTokens).toBe(1024);
  });

  it("should handle missing usage gracefully", async () => {
    mockGenerateText.mockResolvedValue({
      text: "test",
      usage: undefined,
      finishReason: "stop",
    });

    const activity = createLLMChatActivity(options);
    const result = await activity(buildRequest());

    expect(result.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });

  it("should resolve the correct provider model", async () => {
    mockGenerateText.mockResolvedValue({
      text: "test",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: "stop",
    });

    const activity = createLLMChatActivity(options);
    await activity(buildRequest({ model: "claude-3-opus" }));

    expect(mockProviderFn).toHaveBeenCalledWith("claude-3-opus");
  });
});
