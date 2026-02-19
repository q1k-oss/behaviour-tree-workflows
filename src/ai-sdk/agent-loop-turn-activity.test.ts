/**
 * Tests for agent-loop-turn-activity.ts
 *
 * Tests createAgentLoopTurnActivity() — the AI SDK-based implementation
 * of the agentLoopTurn activity for tool-calling LLM conversations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LanguageModel } from "ai";
import { createAgentLoopTurnActivity } from "./agent-loop-turn-activity.js";
import type { CreateAIActivitiesOptions } from "./types.js";
import type { AgentLoopTurnRequest } from "../types.js";

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
import { generateText, streamText } from "ai";

const mockGenerateText = generateText as ReturnType<typeof vi.fn>;
const mockStreamText = streamText as ReturnType<typeof vi.fn>;

describe("createAgentLoopTurnActivity", () => {
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

  function buildRequest(overrides?: Partial<AgentLoopTurnRequest>): AgentLoopTurnRequest {
    return {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Hello" }],
      ...overrides,
    };
  }

  it("should return text-only response with end_turn stop reason", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Hello! I'm here to help.",
      toolCalls: [],
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });

    const activity = createAgentLoopTurnActivity(options);
    const result = await activity(buildRequest());

    expect(result.content).toBe("Hello! I'm here to help.");
    expect(result.toolCalls).toBeUndefined(); // empty array becomes undefined
    expect(result.stopReason).toBe("end_turn");
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });

  it("should map tool call response correctly", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Let me check the weather.",
      toolCalls: [
        {
          toolCallId: "tc_1",
          toolName: "get_weather",
          input: { city: "San Francisco" },
        },
      ],
      finishReason: "tool-calls",
      usage: { inputTokens: 20, outputTokens: 15, totalTokens: 35 },
    });

    const activity = createAgentLoopTurnActivity(options);
    const result = await activity(buildRequest());

    expect(result.content).toBe("Let me check the weather.");
    expect(result.toolCalls).toBeDefined();
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0]).toEqual({
      id: "tc_1",
      name: "get_weather",
      input: { city: "San Francisco" },
    });
    expect(result.stopReason).toBe("tool_use");
  });

  it("should handle multiple tool calls in a single response", async () => {
    mockGenerateText.mockResolvedValue({
      text: "I'll check both.",
      toolCalls: [
        { toolCallId: "tc_1", toolName: "get_weather", input: { city: "SF" } },
        { toolCallId: "tc_2", toolName: "get_time", input: { timezone: "PST" } },
      ],
      finishReason: "tool-calls",
      usage: { inputTokens: 25, outputTokens: 20, totalTokens: 45 },
    });

    const activity = createAgentLoopTurnActivity(options);
    const result = await activity(buildRequest());

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls![0]).toEqual({
      id: "tc_1",
      name: "get_weather",
      input: { city: "SF" },
    });
    expect(result.toolCalls![1]).toEqual({
      id: "tc_2",
      name: "get_time",
      input: { timezone: "PST" },
    });
  });

  it("should map stop reasons correctly", async () => {
    const stopReasonTests: Array<{ sdk: string; library: string }> = [
      { sdk: "tool-calls", library: "tool_use" },
      { sdk: "length", library: "max_tokens" },
      { sdk: "stop", library: "end_turn" },
    ];

    for (const { sdk, library } of stopReasonTests) {
      mockGenerateText.mockResolvedValue({
        text: "test",
        toolCalls: [],
        finishReason: sdk,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      });

      const activity = createAgentLoopTurnActivity(options);
      const result = await activity(buildRequest());

      expect(result.stopReason).toBe(library);
    }
  });

  it("should default unknown finish reasons to end_turn", async () => {
    mockGenerateText.mockResolvedValue({
      text: "test",
      toolCalls: [],
      finishReason: "content-filter",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });

    const activity = createAgentLoopTurnActivity(options);
    const result = await activity(buildRequest());

    expect(result.stopReason).toBe("end_turn");
  });

  it("should map usage correctly (inputTokens -> promptTokens, outputTokens -> completionTokens)", async () => {
    mockGenerateText.mockResolvedValue({
      text: "test",
      toolCalls: [],
      finishReason: "stop",
      usage: { inputTokens: 42, outputTokens: 18, totalTokens: 60 },
    });

    const activity = createAgentLoopTurnActivity(options);
    const result = await activity(buildRequest());

    expect(result.usage).toEqual({
      promptTokens: 42,
      completionTokens: 18,
      totalTokens: 60,
    });
  });

  it("should handle missing usage gracefully", async () => {
    mockGenerateText.mockResolvedValue({
      text: "test",
      toolCalls: [],
      finishReason: "stop",
      usage: undefined,
    });

    const activity = createAgentLoopTurnActivity(options);
    const result = await activity(buildRequest());

    expect(result.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });

  describe("streaming path", () => {
    it("should use streamText when streamChannelId and onStreamToken are provided", async () => {
      const onStreamToken = vi.fn();
      const onStreamComplete = vi.fn();

      const streamOptions: CreateAIActivitiesOptions = {
        ...options,
        onStreamToken,
        onStreamComplete,
      };

      const mockStreamResult = {
        textStream: (async function* () {
          yield "Hello";
          yield " world";
        })(),
        text: Promise.resolve("Hello world"),
        toolCalls: Promise.resolve([]),
        finishReason: Promise.resolve("stop"),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
      };

      mockStreamText.mockReturnValue(mockStreamResult);

      const activity = createAgentLoopTurnActivity(streamOptions);
      const result = await activity(
        buildRequest({ streamChannelId: "channel-123" })
      );

      expect(mockStreamText).toHaveBeenCalledTimes(1);
      expect(mockGenerateText).not.toHaveBeenCalled();

      // Verify streaming callbacks were called
      expect(onStreamToken).toHaveBeenCalledWith("channel-123", "Hello");
      expect(onStreamToken).toHaveBeenCalledWith("channel-123", " world");
      expect(onStreamComplete).toHaveBeenCalledWith("channel-123");

      // Verify final result
      expect(result.content).toBe("Hello world");
      expect(result.stopReason).toBe("end_turn");
    });

    it("should use generateText when streamChannelId is not provided", async () => {
      mockGenerateText.mockResolvedValue({
        text: "Response",
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
      });

      const streamOptions: CreateAIActivitiesOptions = {
        ...options,
        onStreamToken: vi.fn(),
      };

      const activity = createAgentLoopTurnActivity(streamOptions);
      await activity(buildRequest());

      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      expect(mockStreamText).not.toHaveBeenCalled();
    });

    it("should use generateText when onStreamToken is not provided", async () => {
      mockGenerateText.mockResolvedValue({
        text: "Response",
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
      });

      const activity = createAgentLoopTurnActivity(options);
      await activity(buildRequest({ streamChannelId: "channel-123" }));

      // Without onStreamToken, should fall back to non-streaming
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      expect(mockStreamText).not.toHaveBeenCalled();
    });

    it("should handle tool calls in streaming response", async () => {
      const onStreamToken = vi.fn();

      const streamOptions: CreateAIActivitiesOptions = {
        ...options,
        onStreamToken,
      };

      const mockStreamResult = {
        textStream: (async function* () {
          yield "Let me check.";
        })(),
        text: Promise.resolve("Let me check."),
        toolCalls: Promise.resolve([
          { toolCallId: "tc_1", toolName: "get_weather", input: { city: "SF" } },
        ]),
        finishReason: Promise.resolve("tool-calls"),
        usage: Promise.resolve({ inputTokens: 15, outputTokens: 10, totalTokens: 25 }),
      };

      mockStreamText.mockReturnValue(mockStreamResult);

      const activity = createAgentLoopTurnActivity(streamOptions);
      const result = await activity(
        buildRequest({ streamChannelId: "ch-1" })
      );

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe("get_weather");
      expect(result.stopReason).toBe("tool_use");
    });
  });

  it("should pass tools to generateText when provided", async () => {
    mockGenerateText.mockResolvedValue({
      text: "test",
      toolCalls: [],
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });

    const activity = createAgentLoopTurnActivity(options);
    await activity(
      buildRequest({
        tools: [
          {
            name: "get_weather",
            description: "Get weather",
            inputSchema: { type: "object", properties: { city: { type: "string" } } },
          },
        ],
      })
    );

    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.tools).toBeDefined();
    expect(Object.keys(callArgs.tools)).toContain("get_weather");
  });

  it("should not pass tools when tools array is empty", async () => {
    mockGenerateText.mockResolvedValue({
      text: "test",
      toolCalls: [],
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });

    const activity = createAgentLoopTurnActivity(options);
    await activity(buildRequest({ tools: [] }));

    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.tools).toBeUndefined();
  });

  it("should pass temperature and maxOutputTokens", async () => {
    mockGenerateText.mockResolvedValue({
      text: "test",
      toolCalls: [],
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });

    const activity = createAgentLoopTurnActivity(options);
    await activity(
      buildRequest({
        temperature: 0.5,
        maxTokens: 2048,
      })
    );

    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.temperature).toBe(0.5);
    expect(callArgs.maxOutputTokens).toBe(2048);
  });

  it("should propagate errors from generateText", async () => {
    mockGenerateText.mockRejectedValue(new Error("Service unavailable"));

    const activity = createAgentLoopTurnActivity(options);

    await expect(activity(buildRequest())).rejects.toThrow("Service unavailable");
  });

  it("should return undefined toolCalls when response has no tool calls", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Just text",
      toolCalls: undefined,
      finishReason: "stop",
      usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
    });

    const activity = createAgentLoopTurnActivity(options);
    const result = await activity(buildRequest());

    expect(result.toolCalls).toBeUndefined();
  });

  it("should handle system prompt in the messages", async () => {
    mockGenerateText.mockResolvedValue({
      text: "test",
      toolCalls: [],
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });

    const activity = createAgentLoopTurnActivity(options);
    await activity(
      buildRequest({
        systemPrompt: "You are a helpful assistant.",
        messages: [{ role: "user", content: "Hi" }],
      })
    );

    const callArgs = mockGenerateText.mock.calls[0][0];
    // System prompt is mapped via mapAgentMessages
    expect(callArgs.messages[0]).toEqual({
      role: "system",
      content: "You are a helpful assistant.",
    });
    expect(callArgs.messages[1]).toEqual({
      role: "user",
      content: "Hi",
    });
  });
});
