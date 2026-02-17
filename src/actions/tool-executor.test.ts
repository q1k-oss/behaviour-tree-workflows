/**
 * Tests for ToolExecutor Node
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type TemporalContext,
  type BtreeActivities,
  type AgentMessage,
  type AgentContentBlock,
  NodeStatus,
  ScopedBlackboard,
} from "../index.js";
import { ToolExecutor } from "./tool-executor.js";

describe("ToolExecutor", () => {
  let blackboard: ScopedBlackboard;
  let mockActivities: Partial<BtreeActivities>;
  let context: TemporalContext;

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    mockActivities = {
      executeAgentTool: vi.fn(),
    };
    context = {
      blackboard,
      timestamp: Date.now(),
      deltaTime: 0,
      activities: mockActivities as BtreeActivities,
    };
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("should execute a single tool call and append result to messages", async () => {
    // Setup LLM response with tool calls
    blackboard.set("llmResponse", {
      content: "Let me check.",
      toolCalls: [
        { id: "tc_1", name: "get_weather", input: { city: "SF" } },
      ],
      stopReason: "tool_use",
    });

    // Setup existing conversation
    blackboard.set("msgs", [
      { role: "user", content: "What's the weather?" },
      { role: "assistant", content: [
        { type: "text", text: "Let me check." },
        { type: "tool_use", id: "tc_1", name: "get_weather", input: { city: "SF" } },
      ]},
    ] as AgentMessage[]);

    // Mock tool execution
    (mockActivities.executeAgentTool as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: "72F, sunny in San Francisco",
      isError: false,
    });

    const node = new ToolExecutor({
      id: "te-1",
      responseKey: "llmResponse",
      messagesKey: "msgs",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);

    // Check activity was called correctly
    expect(mockActivities.executeAgentTool).toHaveBeenCalledWith({
      toolName: "get_weather",
      toolInput: { city: "SF" },
    });

    // Check messages has tool_result appended
    const messages = blackboard.get("msgs") as AgentMessage[];
    expect(messages).toHaveLength(3);
    expect(messages[2].role).toBe("user");
    const content = messages[2].content as AgentContentBlock[];
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("tool_result");
    expect((content[0] as any).tool_use_id).toBe("tc_1");
    expect((content[0] as any).content).toBe("72F, sunny in San Francisco");
    expect((content[0] as any).is_error).toBe(false);
  });

  it("should execute multiple tool calls", async () => {
    blackboard.set("llmResponse", {
      toolCalls: [
        { id: "tc_1", name: "get_weather", input: { city: "SF" } },
        { id: "tc_2", name: "calculate", input: { expression: "2+2" } },
      ],
    });
    blackboard.set("msgs", []);

    (mockActivities.executeAgentTool as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ content: "72F sunny", isError: false })
      .mockResolvedValueOnce({ content: "4", isError: false });

    const node = new ToolExecutor({
      id: "te-2",
      responseKey: "llmResponse",
      messagesKey: "msgs",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(mockActivities.executeAgentTool).toHaveBeenCalledTimes(2);

    const messages = blackboard.get("msgs") as AgentMessage[];
    expect(messages).toHaveLength(1);
    const content = messages[0].content as AgentContentBlock[];
    expect(content).toHaveLength(2);
    expect((content[0] as any).tool_use_id).toBe("tc_1");
    expect((content[1] as any).tool_use_id).toBe("tc_2");
  });

  it("should handle tool errors (isError=true) and still return SUCCESS", async () => {
    blackboard.set("llmResponse", {
      toolCalls: [
        { id: "tc_1", name: "unknown_tool", input: {} },
      ],
    });
    blackboard.set("msgs", []);

    (mockActivities.executeAgentTool as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: "Unknown tool: unknown_tool",
      isError: true,
    });

    const node = new ToolExecutor({
      id: "te-3",
      responseKey: "llmResponse",
      messagesKey: "msgs",
    });

    const result = await node.tick(context);

    // Still SUCCESS - tool errors are fed back to LLM for recovery
    expect(result).toBe(NodeStatus.SUCCESS);

    const messages = blackboard.get("msgs") as AgentMessage[];
    const content = messages[0].content as AgentContentBlock[];
    expect((content[0] as any).is_error).toBe(true);
  });

  it("should return SUCCESS when no tool calls present", async () => {
    blackboard.set("llmResponse", {
      content: "Just text, no tools",
      stopReason: "end_turn",
    });

    const node = new ToolExecutor({
      id: "te-4",
      responseKey: "llmResponse",
      messagesKey: "msgs",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(mockActivities.executeAgentTool).not.toHaveBeenCalled();
  });

  it("should return SUCCESS when toolCalls is empty array", async () => {
    blackboard.set("llmResponse", {
      content: "No tools",
      toolCalls: [],
      stopReason: "end_turn",
    });

    const node = new ToolExecutor({
      id: "te-5",
      responseKey: "llmResponse",
      messagesKey: "msgs",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(mockActivities.executeAgentTool).not.toHaveBeenCalled();
  });

  it("should write results to outputKey when specified", async () => {
    blackboard.set("llmResponse", {
      toolCalls: [
        { id: "tc_1", name: "get_weather", input: { city: "NY" } },
      ],
    });
    blackboard.set("msgs", []);

    (mockActivities.executeAgentTool as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: "45F, cloudy",
      isError: false,
    });

    const node = new ToolExecutor({
      id: "te-6",
      responseKey: "llmResponse",
      messagesKey: "msgs",
      outputKey: "toolResults",
    });

    await node.tick(context);

    const results = blackboard.get("toolResults") as any[];
    expect(results).toHaveLength(1);
    expect(results[0].toolName).toBe("get_weather");
    expect(results[0].content).toBe("45F, cloudy");
    expect(results[0].isError).toBe(false);
  });

  it("should fail when executeAgentTool activity is missing", async () => {
    const noActivityContext: TemporalContext = {
      blackboard,
      timestamp: Date.now(),
      deltaTime: 0,
      activities: {} as BtreeActivities,
    };

    blackboard.set("llmResponse", {
      toolCalls: [{ id: "tc_1", name: "foo", input: {} }],
    });

    const node = new ToolExecutor({
      id: "te-7",
      responseKey: "llmResponse",
      messagesKey: "msgs",
    });

    const result = await node.tick(noActivityContext);

    expect(result).toBe(NodeStatus.FAILURE);
  });

  describe("configuration validation", () => {
    it("should throw ConfigurationError when responseKey is missing", () => {
      expect(() => new ToolExecutor({
        id: "bad",
        responseKey: "",
        messagesKey: "msgs",
      })).toThrow("ToolExecutor requires responseKey");
    });

    it("should throw ConfigurationError when messagesKey is missing", () => {
      expect(() => new ToolExecutor({
        id: "bad",
        responseKey: "resp",
        messagesKey: "",
      })).toThrow("ToolExecutor requires messagesKey");
    });
  });

  it("should return FAILURE when activity throws an exception", async () => {
    blackboard.set("llmResponse", {
      toolCalls: [
        { id: "tc_1", name: "crash", input: {} },
      ],
    });
    blackboard.set("msgs", []);

    (mockActivities.executeAgentTool as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Activity crashed unexpectedly")
    );

    const node = new ToolExecutor({
      id: "te-crash",
      responseKey: "llmResponse",
      messagesKey: "msgs",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.FAILURE);
    expect(node.lastError).toBe("Activity crashed unexpectedly");
  });

  it("should handle non-Error exceptions in catch block", async () => {
    blackboard.set("llmResponse", {
      toolCalls: [{ id: "tc_1", name: "crash", input: {} }],
    });
    blackboard.set("msgs", []);

    (mockActivities.executeAgentTool as ReturnType<typeof vi.fn>).mockRejectedValue("string error");

    const node = new ToolExecutor({
      id: "te-string-err",
      responseKey: "llmResponse",
      messagesKey: "msgs",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.FAILURE);
    expect(node.lastError).toBe("string error");
  });

  it("should handle undefined response gracefully", async () => {
    // responseKey points to nothing
    const node = new ToolExecutor({
      id: "te-undef",
      responseKey: "nonExistentKey",
      messagesKey: "msgs",
    });

    const result = await node.tick(context);

    // No tool calls → SUCCESS
    expect(result).toBe(NodeStatus.SUCCESS);
    expect(mockActivities.executeAgentTool).not.toHaveBeenCalled();
  });

  it("should initialize empty messages array if key doesn't exist", async () => {
    blackboard.set("llmResponse", {
      toolCalls: [
        { id: "tc_1", name: "test", input: {} },
      ],
    });
    // Don't set msgs

    (mockActivities.executeAgentTool as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: "result",
      isError: false,
    });

    const node = new ToolExecutor({
      id: "te-8",
      responseKey: "llmResponse",
      messagesKey: "msgs",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    const messages = blackboard.get("msgs") as AgentMessage[];
    expect(messages).toHaveLength(1);
  });
});
