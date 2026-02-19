/**
 * Tests for LLMToolCall Node
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type TemporalContext,
  type BtreeActivities,
  type AgentMessage,
  type AgentToolDefinition,
  type AgentLoopTurnResult,
  NodeStatus,
  ScopedBlackboard,
} from "../index.js";
import { LLMToolCall } from "./llm-tool-call.js";

describe("LLMToolCall", () => {
  let blackboard: ScopedBlackboard;
  let mockActivities: Partial<BtreeActivities>;
  let context: TemporalContext;

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    mockActivities = {
      agentLoopTurn: vi.fn(),
    };
    context = {
      blackboard,
      timestamp: Date.now(),
      deltaTime: 0,
      activities: mockActivities as BtreeActivities,
    };
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("should call LLM and return text response (end_turn)", async () => {
    const mockResult: AgentLoopTurnResult = {
      content: "Hello! How can I help?",
      stopReason: "end_turn",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    blackboard.set("msgs", [
      { role: "user", content: "Hello" } as AgentMessage,
    ]);

    const node = new LLMToolCall({
      id: "ltc-1",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      messagesKey: "msgs",
      outputKey: "llmResponse",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);

    // Check output
    const output = blackboard.get("llmResponse") as any;
    expect(output.content).toBe("Hello! How can I help?");
    expect(output.stopReason).toBe("end_turn");
    expect(output.toolCalls).toBeUndefined();

    // Check messages updated with assistant response
    const messages = blackboard.get("msgs") as AgentMessage[];
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("Hello! How can I help?");
  });

  it("should handle tool_use response with content blocks", async () => {
    const mockResult: AgentLoopTurnResult = {
      content: "Let me check the weather.",
      toolCalls: [
        { id: "tc_1", name: "get_weather", input: { city: "San Francisco" } },
      ],
      stopReason: "tool_use",
      usage: { promptTokens: 20, completionTokens: 15, totalTokens: 35 },
    };
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    blackboard.set("msgs", [
      { role: "user", content: "What's the weather in SF?" } as AgentMessage,
    ]);

    const node = new LLMToolCall({
      id: "ltc-2",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      messagesKey: "msgs",
      tools: [
        {
          name: "get_weather",
          description: "Get weather",
          inputSchema: { type: "object", properties: { city: { type: "string" } } },
        },
      ],
      outputKey: "llmResponse",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);

    // Check output has toolCalls
    const output = blackboard.get("llmResponse") as any;
    expect(output.stopReason).toBe("tool_use");
    expect(output.toolCalls).toHaveLength(1);
    expect(output.toolCalls[0].name).toBe("get_weather");

    // Check messages updated with structured content blocks
    const messages = blackboard.get("msgs") as AgentMessage[];
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe("assistant");
    const content = messages[1].content as any[];
    expect(content).toHaveLength(2); // text + tool_use
    expect(content[0].type).toBe("text");
    expect(content[1].type).toBe("tool_use");
    expect(content[1].name).toBe("get_weather");
  });

  it("should append userMessageKey content to conversation", async () => {
    const mockResult: AgentLoopTurnResult = {
      content: "Hi there!",
      stopReason: "end_turn",
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
    };
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    blackboard.set("userMessage", "Hello from user");

    const node = new LLMToolCall({
      id: "ltc-3",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      messagesKey: "msgs",
      userMessageKey: "userMessage",
      outputKey: "llmResponse",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);

    // Check the activity was called with the user message appended
    const callArgs = (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.messages).toHaveLength(1);
    expect(callArgs.messages[0].role).toBe("user");
    expect(callArgs.messages[0].content).toBe("Hello from user");

    // userMessageKey should be cleared
    expect(blackboard.get("userMessage")).toBeNull();
  });

  it("should not append userMessageKey if value is null", async () => {
    const mockResult: AgentLoopTurnResult = {
      content: "Response",
      stopReason: "end_turn",
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
    };
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    blackboard.set("msgs", [{ role: "user", content: "existing" }]);
    blackboard.set("userMessage", null);

    const node = new LLMToolCall({
      id: "ltc-4",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      messagesKey: "msgs",
      userMessageKey: "userMessage",
      outputKey: "llmResponse",
    });

    await node.tick(context);

    // Should only have the existing message, not append null
    const callArgs = (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.messages).toHaveLength(1);
    expect(callArgs.messages[0].content).toBe("existing");
  });

  it("should initialize empty messages array if key doesn't exist", async () => {
    const mockResult: AgentLoopTurnResult = {
      content: "Hello!",
      stopReason: "end_turn",
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
    };
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    // Don't set any messages on blackboard
    blackboard.set("userMessage", "First message");

    const node = new LLMToolCall({
      id: "ltc-5",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      messagesKey: "msgs",
      userMessageKey: "userMessage",
      outputKey: "llmResponse",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);

    // Messages should now have user + assistant
    const messages = blackboard.get("msgs") as AgentMessage[];
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
  });

  it("should read tools from toolsKey (dynamic)", async () => {
    const mockResult: AgentLoopTurnResult = {
      content: "OK",
      stopReason: "end_turn",
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
    };
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    const dynamicTools: AgentToolDefinition[] = [
      { name: "search", description: "Search the web", inputSchema: { type: "object" } },
    ];
    blackboard.set("selectedTools", dynamicTools);
    blackboard.set("msgs", [{ role: "user", content: "search for cats" }]);

    const node = new LLMToolCall({
      id: "ltc-6",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      messagesKey: "msgs",
      toolsKey: "selectedTools",
      outputKey: "llmResponse",
    });

    await node.tick(context);

    const callArgs = (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.tools).toHaveLength(1);
    expect(callArgs.tools[0].name).toBe("search");
  });

  it("should pass streamChannelId from blackboard", async () => {
    const mockResult: AgentLoopTurnResult = {
      content: "Streamed response",
      stopReason: "end_turn",
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
    };
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    blackboard.set("__streamChannelId", "channel-123");
    blackboard.set("msgs", [{ role: "user", content: "hi" }]);

    const node = new LLMToolCall({
      id: "ltc-7",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      messagesKey: "msgs",
      outputKey: "llmResponse",
    });

    await node.tick(context);

    const callArgs = (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.streamChannelId).toBe("channel-123");
  });

  it("should resolve variables in model and systemPrompt", async () => {
    const mockResult: AgentLoopTurnResult = {
      content: "Resolved",
      stopReason: "end_turn",
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
    };
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    blackboard.set("selectedModel", "gpt-4");
    blackboard.set("role", "data analyst");
    blackboard.set("msgs", [{ role: "user", content: "analyze" }]);

    const node = new LLMToolCall({
      id: "ltc-8",
      provider: "openai",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional
      model: "${bb.selectedModel}",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional
      systemPrompt: "You are a ${bb.role}.",
      messagesKey: "msgs",
      outputKey: "llmResponse",
    });

    await node.tick(context);

    const callArgs = (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.model).toBe("gpt-4");
    expect(callArgs.systemPrompt).toBe("You are a data analyst.");
  });

  it("should fail when agentLoopTurn activity is missing", async () => {
    const noActivityContext: TemporalContext = {
      blackboard,
      timestamp: Date.now(),
      deltaTime: 0,
      activities: {} as BtreeActivities,
    };

    const node = new LLMToolCall({
      id: "ltc-9",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      messagesKey: "msgs",
      outputKey: "llmResponse",
    });

    const result = await node.tick(noActivityContext);

    expect(result).toBe(NodeStatus.FAILURE);
  });

  describe("configuration validation", () => {
    it("should throw ConfigurationError when provider is missing", () => {
      expect(() => new LLMToolCall({
        id: "bad",
        provider: "" as any,
        model: "test",
        messagesKey: "msgs",
        outputKey: "out",
      })).toThrow("LLMToolCall requires provider");
    });

    it("should throw ConfigurationError when model is missing", () => {
      expect(() => new LLMToolCall({
        id: "bad",
        provider: "anthropic",
        model: "",
        messagesKey: "msgs",
        outputKey: "out",
      })).toThrow("LLMToolCall requires model");
    });

    it("should throw ConfigurationError when messagesKey is missing", () => {
      expect(() => new LLMToolCall({
        id: "bad",
        provider: "anthropic",
        model: "test",
        messagesKey: "",
        outputKey: "out",
      })).toThrow("LLMToolCall requires messagesKey");
    });

    it("should throw ConfigurationError when outputKey is missing", () => {
      expect(() => new LLMToolCall({
        id: "bad",
        provider: "anthropic",
        model: "test",
        messagesKey: "msgs",
        outputKey: "",
      })).toThrow("LLMToolCall requires outputKey");
    });
  });

  it("should handle tool_use with empty content (no thinking text)", async () => {
    const mockResult: AgentLoopTurnResult = {
      content: "",
      toolCalls: [
        { id: "tc_1", name: "get_weather", input: { city: "SF" } },
      ],
      stopReason: "tool_use",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    blackboard.set("msgs", [
      { role: "user", content: "Weather?" } as AgentMessage,
    ]);

    const node = new LLMToolCall({
      id: "ltc-empty-content",
      provider: "anthropic",
      model: "test",
      messagesKey: "msgs",
      outputKey: "llmResponse",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);

    // Messages should have assistant with content blocks
    const messages = blackboard.get("msgs") as AgentMessage[];
    const content = messages[1].content as any[];
    // Empty content should NOT produce a text block
    expect(content.every((b: any) => b.type === "tool_use")).toBe(true);
  });

  it("should handle non-string userMessageKey value", async () => {
    const mockResult: AgentLoopTurnResult = {
      content: "Got it",
      stopReason: "end_turn",
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
    };
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    // Set a non-string value
    blackboard.set("userMessage", 42);

    const node = new LLMToolCall({
      id: "ltc-nonstring",
      provider: "anthropic",
      model: "test",
      messagesKey: "msgs",
      userMessageKey: "userMessage",
      outputKey: "llmResponse",
    });

    await node.tick(context);

    // Should convert to string
    const callArgs = (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.messages[0].content).toBe("42");
  });

  it("should not pass tools when neither toolsKey nor tools are set", async () => {
    const mockResult: AgentLoopTurnResult = {
      content: "OK",
      stopReason: "end_turn",
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
    };
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    blackboard.set("msgs", [{ role: "user", content: "hi" }]);

    const node = new LLMToolCall({
      id: "ltc-no-tools",
      provider: "anthropic",
      model: "test",
      messagesKey: "msgs",
      outputKey: "llmResponse",
    });

    await node.tick(context);

    const callArgs = (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.tools).toBeUndefined();
  });

  it("should set lastError on activity failure", async () => {
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Connection timeout")
    );

    blackboard.set("msgs", [{ role: "user", content: "test" }]);

    const node = new LLMToolCall({
      id: "ltc-error-msg",
      provider: "anthropic",
      model: "test",
      messagesKey: "msgs",
      outputKey: "llmResponse",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.FAILURE);
    expect(node.lastError).toBe("Connection timeout");
  });

  it("should handle non-Error exceptions gracefully", async () => {
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mockRejectedValue(
      "string error"
    );

    blackboard.set("msgs", [{ role: "user", content: "test" }]);

    const node = new LLMToolCall({
      id: "ltc-string-error",
      provider: "anthropic",
      model: "test",
      messagesKey: "msgs",
      outputKey: "llmResponse",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.FAILURE);
    expect(node.lastError).toBe("string error");
  });

  it("should handle activity errors gracefully", async () => {
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("API rate limit exceeded")
    );

    blackboard.set("msgs", [{ role: "user", content: "hi" }]);

    const node = new LLMToolCall({
      id: "ltc-10",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      messagesKey: "msgs",
      outputKey: "llmResponse",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.FAILURE);
    expect(node.lastError).toContain("API rate limit exceeded");
  });
});
