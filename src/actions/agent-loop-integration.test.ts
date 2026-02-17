/**
 * Integration tests for the decomposed agent loop pattern.
 *
 * Tests the full While + LLMToolCall + Conditional + ToolExecutor + SetVariable
 * composition that forms the agent reasoning loop.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type TemporalContext,
  type BtreeActivities,
  type AgentMessage,
  type AgentLoopTurnResult,
  type AgentContentBlock,
  NodeStatus,
  ScopedBlackboard,
} from "../index.js";
import { While } from "../composites/while.js";
import { Sequence } from "../composites/sequence.js";
import { Conditional } from "../composites/conditional.js";
import { CheckCondition } from "../test-nodes.js";
import { LLMToolCall } from "./llm-tool-call.js";
import { ToolExecutor } from "./tool-executor.js";
import { SetVariable } from "../utilities/set-variable.js";

describe("Agent Loop Integration", () => {
  let blackboard: ScopedBlackboard;
  let mockActivities: Partial<BtreeActivities>;
  let context: TemporalContext;

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    mockActivities = {
      agentLoopTurn: vi.fn(),
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

  /**
   * Builds the standard agent loop tree:
   *
   * While(agentLooping == true)
   *   Sequence
   *     LLMToolCall
   *     Conditional
   *       CheckCondition(stopReason == "tool_use")
   *       ToolExecutor           (then: execute tools, loop continues)
   *       SetVariable(agentLooping = false) (else: done, break)
   */
  function buildAgentLoop(): While {
    const whileNode = new While({ id: "agent-loop", maxIterations: 15 });

    // Condition: agentLooping == true
    const condition = new CheckCondition({
      id: "check-loop",
      key: "agentLooping",
      operator: "==",
      value: true,
    });
    whileNode.addChild(condition);

    // Body: Sequence
    const body = new Sequence({ id: "turn" });

    // 1. LLMToolCall
    const llmCall = new LLMToolCall({
      id: "call-llm",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      systemPrompt: "You are a helpful assistant.",
      messagesKey: "messages",
      userMessageKey: "userMessage",
      tools: [
        {
          name: "get_weather",
          description: "Get weather for a city",
          inputSchema: { type: "object", properties: { city: { type: "string" } } },
        },
      ],
      outputKey: "llmResponse",
    });
    body.addChild(llmCall);

    // 2. Conditional: check stopReason
    const conditional = new Conditional({ id: "check-tools" });

    // Condition: stopReason == "tool_use"
    const toolCheck = new CheckCondition({
      id: "check-stop",
      key: "llmResponse.stopReason",
      operator: "==",
      value: "tool_use",
    });
    conditional.addChild(toolCheck);

    // Then: ToolExecutor (tools requested, loop continues)
    const toolExec = new ToolExecutor({
      id: "exec-tools",
      responseKey: "llmResponse",
      messagesKey: "messages",
    });
    conditional.addChild(toolExec);

    // Else: SetVariable(agentLooping = false) — done
    const stopLoop = new SetVariable({
      id: "stop-loop",
      key: "agentLooping",
      value: false,
    });
    conditional.addChild(stopLoop);

    body.addChild(conditional);
    whileNode.addChild(body);

    return whileNode;
  }

  it("should complete a single-turn agent loop (no tools, immediate end_turn)", async () => {
    // LLM returns end_turn immediately
    const endTurnResult: AgentLoopTurnResult = {
      content: "Hello! I'm here to help.",
      stopReason: "end_turn",
      usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
    };
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mockResolvedValue(endTurnResult);

    // Initialize loop
    blackboard.set("agentLooping", true);
    blackboard.set("userMessage", "Hello");

    const loop = buildAgentLoop();
    const result = await loop.tick(context);

    // While exits with SUCCESS when condition fails (agentLooping = false)
    expect(result).toBe(NodeStatus.SUCCESS);

    // LLM called once
    expect(mockActivities.agentLoopTurn).toHaveBeenCalledTimes(1);

    // No tools executed
    expect(mockActivities.executeAgentTool).not.toHaveBeenCalled();

    // agentLooping should be false
    expect(blackboard.get("agentLooping")).toBe(false);

    // Messages should have user + assistant
    const messages = blackboard.get("messages") as AgentMessage[];
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("Hello! I'm here to help.");
  });

  it("should execute tool_use → tool_result → end_turn (two iterations)", async () => {
    // First call: LLM requests a tool
    const toolUseResult: AgentLoopTurnResult = {
      content: "Let me check the weather.",
      toolCalls: [
        { id: "tc_1", name: "get_weather", input: { city: "San Francisco" } },
      ],
      stopReason: "tool_use",
      usage: { promptTokens: 20, completionTokens: 15, totalTokens: 35 },
    };

    // Second call: LLM responds with final answer
    const endTurnResult: AgentLoopTurnResult = {
      content: "The weather in San Francisco is 72F and sunny!",
      stopReason: "end_turn",
      usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
    };

    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(toolUseResult)
      .mockResolvedValueOnce(endTurnResult);

    // Mock tool execution
    (mockActivities.executeAgentTool as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: '{"temp": "72F", "condition": "sunny"}',
      isError: false,
    });

    // Initialize
    blackboard.set("agentLooping", true);
    blackboard.set("userMessage", "What's the weather in SF?");

    const loop = buildAgentLoop();
    const result = await loop.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);

    // LLM called twice (tool_use → end_turn)
    expect(mockActivities.agentLoopTurn).toHaveBeenCalledTimes(2);

    // Tool executed once
    expect(mockActivities.executeAgentTool).toHaveBeenCalledTimes(1);
    expect(mockActivities.executeAgentTool).toHaveBeenCalledWith({
      toolName: "get_weather",
      toolInput: { city: "San Francisco" },
    });

    // Verify conversation accumulated correctly
    const messages = blackboard.get("messages") as AgentMessage[];
    // user → assistant(tool_use) → user(tool_result) → assistant(end_turn)
    expect(messages).toHaveLength(4);

    // Message 0: user
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("What's the weather in SF?");

    // Message 1: assistant with tool_use blocks
    expect(messages[1].role).toBe("assistant");
    const assistantContent = messages[1].content as AgentContentBlock[];
    expect(Array.isArray(assistantContent)).toBe(true);
    expect(assistantContent.some(b => b.type === "tool_use")).toBe(true);

    // Message 2: user with tool_result blocks
    expect(messages[2].role).toBe("user");
    const toolResultContent = messages[2].content as AgentContentBlock[];
    expect(Array.isArray(toolResultContent)).toBe(true);
    expect(toolResultContent[0].type).toBe("tool_result");

    // Message 3: assistant final answer
    expect(messages[3].role).toBe("assistant");
    expect(messages[3].content).toBe("The weather in San Francisco is 72F and sunny!");

    // Final response
    const response = blackboard.get("llmResponse") as any;
    expect(response.content).toBe("The weather in San Francisco is 72F and sunny!");
    expect(response.stopReason).toBe("end_turn");
  });

  it("should handle multiple tool iterations before final answer", async () => {
    // 3 iterations: tool_use → tool_use → end_turn
    const toolUse1: AgentLoopTurnResult = {
      content: "Getting weather...",
      toolCalls: [{ id: "tc_1", name: "get_weather", input: { city: "SF" } }],
      stopReason: "tool_use",
      usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
    };
    const toolUse2: AgentLoopTurnResult = {
      content: "Now checking another city...",
      toolCalls: [{ id: "tc_2", name: "get_weather", input: { city: "NYC" } }],
      stopReason: "tool_use",
      usage: { promptTokens: 40, completionTokens: 10, totalTokens: 50 },
    };
    const endTurn: AgentLoopTurnResult = {
      content: "SF is 72F and NYC is 45F.",
      stopReason: "end_turn",
      usage: { promptTokens: 60, completionTokens: 15, totalTokens: 75 },
    };

    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(toolUse1)
      .mockResolvedValueOnce(toolUse2)
      .mockResolvedValueOnce(endTurn);

    (mockActivities.executeAgentTool as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ content: '72F sunny', isError: false })
      .mockResolvedValueOnce({ content: '45F cloudy', isError: false });

    blackboard.set("agentLooping", true);
    blackboard.set("userMessage", "Compare weather in SF and NYC");

    const loop = buildAgentLoop();
    const result = await loop.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(mockActivities.agentLoopTurn).toHaveBeenCalledTimes(3);
    expect(mockActivities.executeAgentTool).toHaveBeenCalledTimes(2);

    // 6 messages: user → assistant(tc1) → user(tr1) → assistant(tc2) → user(tr2) → assistant(final)
    const messages = blackboard.get("messages") as AgentMessage[];
    expect(messages).toHaveLength(6);
  });

  it("should handle tool execution error gracefully (error fed back to LLM)", async () => {
    // LLM requests a tool that errors
    const toolUseResult: AgentLoopTurnResult = {
      content: "Let me try.",
      toolCalls: [{ id: "tc_1", name: "bad_tool", input: {} }],
      stopReason: "tool_use",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
    // LLM recovers after seeing the error
    const recoveryResult: AgentLoopTurnResult = {
      content: "That tool failed, but I can help another way.",
      stopReason: "end_turn",
      usage: { promptTokens: 30, completionTokens: 15, totalTokens: 45 },
    };

    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(toolUseResult)
      .mockResolvedValueOnce(recoveryResult);

    (mockActivities.executeAgentTool as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: "Unknown tool: bad_tool",
      isError: true,
    });

    blackboard.set("agentLooping", true);
    blackboard.set("userMessage", "Do something");

    const loop = buildAgentLoop();
    const result = await loop.tick(context);

    // Loop should complete successfully — errors are fed back to LLM
    expect(result).toBe(NodeStatus.SUCCESS);
    expect(mockActivities.agentLoopTurn).toHaveBeenCalledTimes(2);

    // Verify error was in the tool result
    const messages = blackboard.get("messages") as AgentMessage[];
    const toolResultMsg = messages[2];
    const blocks = toolResultMsg.content as AgentContentBlock[];
    expect((blocks[0] as any).is_error).toBe(true);
  });

  it("should respect maxIterations safety limit", async () => {
    // LLM always requests tools (infinite loop scenario)
    const toolUseResult: AgentLoopTurnResult = {
      content: "Using tool...",
      toolCalls: [{ id: "tc_x", name: "get_weather", input: { city: "SF" } }],
      stopReason: "tool_use",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mockResolvedValue(toolUseResult);
    (mockActivities.executeAgentTool as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: "72F",
      isError: false,
    });

    blackboard.set("agentLooping", true);
    blackboard.set("userMessage", "Loop forever");

    // Build loop with small maxIterations
    const whileNode = new While({ id: "loop", maxIterations: 3 });
    const condition = new CheckCondition({
      id: "c", key: "agentLooping", operator: "==", value: true,
    });
    whileNode.addChild(condition);

    const body = new Sequence({ id: "body" });
    body.addChild(new LLMToolCall({
      id: "llm", provider: "anthropic", model: "test",
      messagesKey: "messages", userMessageKey: "userMessage",
      tools: [{ name: "get_weather", description: "Get weather", inputSchema: { type: "object" } }],
      outputKey: "llmResponse",
    }));

    const cond = new Conditional({ id: "cond" });
    cond.addChild(new CheckCondition({
      id: "cc", key: "llmResponse.stopReason", operator: "==", value: "tool_use",
    }));
    cond.addChild(new ToolExecutor({
      id: "te", responseKey: "llmResponse", messagesKey: "messages",
    }));
    cond.addChild(new SetVariable({ id: "sv", key: "agentLooping", value: false }));
    body.addChild(cond);

    whileNode.addChild(body);

    const result = await whileNode.tick(context);

    // Max iterations reached → FAILURE
    expect(result).toBe(NodeStatus.FAILURE);
    // Should have been called exactly 3 times (maxIterations)
    expect(mockActivities.agentLoopTurn).toHaveBeenCalledTimes(3);
  });

  it("should handle LLM activity throwing an exception mid-loop", async () => {
    // First call succeeds with tool_use
    const toolUseResult: AgentLoopTurnResult = {
      content: "Checking...",
      toolCalls: [{ id: "tc_1", name: "get_weather", input: { city: "SF" } }],
      stopReason: "tool_use",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(toolUseResult)
      // Second call fails
      .mockRejectedValueOnce(new Error("API rate limit exceeded"));

    (mockActivities.executeAgentTool as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: "72F",
      isError: false,
    });

    blackboard.set("agentLooping", true);
    blackboard.set("userMessage", "Weather?");

    const loop = buildAgentLoop();
    const result = await loop.tick(context);

    // LLMToolCall catches the error and returns FAILURE → Sequence fails → body fails → While fails
    expect(result).toBe(NodeStatus.FAILURE);
    expect(mockActivities.agentLoopTurn).toHaveBeenCalledTimes(2);
  });

  it("should handle executeAgentTool activity throwing an exception", async () => {
    const toolUseResult: AgentLoopTurnResult = {
      content: "Let me try.",
      toolCalls: [{ id: "tc_1", name: "crash_tool", input: {} }],
      stopReason: "tool_use",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mockResolvedValue(toolUseResult);

    // Activity throws (not returns isError, but actually throws)
    (mockActivities.executeAgentTool as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Activity crashed")
    );

    blackboard.set("agentLooping", true);
    blackboard.set("userMessage", "Crash");

    const loop = buildAgentLoop();
    const result = await loop.tick(context);

    // ToolExecutor catches the throw → returns FAILURE → Sequence fails → body fails → While fails
    expect(result).toBe(NodeStatus.FAILURE);
  });

  it("should accumulate conversation correctly across multi-turn", async () => {
    // Simulate: user → tool_use → tool_result → end_turn
    // Then verify the second LLM call received all prior messages
    const toolUseResult: AgentLoopTurnResult = {
      content: "Checking weather.",
      toolCalls: [{ id: "tc_1", name: "get_weather", input: { city: "LA" } }],
      stopReason: "tool_use",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
    const endTurnResult: AgentLoopTurnResult = {
      content: "LA is 80F!",
      stopReason: "end_turn",
      usage: { promptTokens: 30, completionTokens: 5, totalTokens: 35 },
    };

    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(toolUseResult)
      .mockResolvedValueOnce(endTurnResult);

    (mockActivities.executeAgentTool as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: "80F sunny",
      isError: false,
    });

    blackboard.set("agentLooping", true);
    blackboard.set("userMessage", "Weather in LA?");

    const loop = buildAgentLoop();
    await loop.tick(context);

    // Verify the SECOND LLM call received the full conversation
    const secondCallArgs = (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mock.calls[1][0];
    const secondCallMessages = secondCallArgs.messages as AgentMessage[];

    // Should have: user → assistant(tool_use) → user(tool_result)
    expect(secondCallMessages).toHaveLength(3);
    expect(secondCallMessages[0].role).toBe("user");
    expect(secondCallMessages[0].content).toBe("Weather in LA?");
    expect(secondCallMessages[1].role).toBe("assistant");
    expect(secondCallMessages[2].role).toBe("user");
    // The tool_result is a content block array
    const toolResultContent = secondCallMessages[2].content as AgentContentBlock[];
    expect(toolResultContent[0].type).toBe("tool_result");
  });

  it("should handle tool_use response with no text content", async () => {
    // LLM returns tool_use with empty content string (no thinking text)
    const toolUseResult: AgentLoopTurnResult = {
      content: "", // empty
      toolCalls: [{ id: "tc_1", name: "get_weather", input: { city: "SF" } }],
      stopReason: "tool_use",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
    const endTurnResult: AgentLoopTurnResult = {
      content: "SF is 72F.",
      stopReason: "end_turn",
      usage: { promptTokens: 20, completionTokens: 5, totalTokens: 25 },
    };

    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(toolUseResult)
      .mockResolvedValueOnce(endTurnResult);

    (mockActivities.executeAgentTool as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: "72F",
      isError: false,
    });

    blackboard.set("agentLooping", true);
    blackboard.set("userMessage", "Weather?");

    const loop = buildAgentLoop();
    const result = await loop.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);

    // Check that empty text was NOT added as a content block
    const messages = blackboard.get("messages") as AgentMessage[];
    const assistantMsg = messages[1];
    const blocks = assistantMsg.content as AgentContentBlock[];
    // Should only have tool_use block, no empty text block
    expect(blocks.every(b => b.type === "tool_use")).toBe(true);
  });

  it("should clear userMessageKey after first iteration", async () => {
    // Two iterations: first with userMessage, second without
    const toolUseResult: AgentLoopTurnResult = {
      content: "",
      toolCalls: [{ id: "tc_1", name: "get_weather", input: { city: "SF" } }],
      stopReason: "tool_use",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
    const endTurnResult: AgentLoopTurnResult = {
      content: "Done",
      stopReason: "end_turn",
      usage: { promptTokens: 20, completionTokens: 5, totalTokens: 25 },
    };

    (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(toolUseResult)
      .mockResolvedValueOnce(endTurnResult);

    (mockActivities.executeAgentTool as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: "72F",
      isError: false,
    });

    blackboard.set("agentLooping", true);
    blackboard.set("userMessage", "Hello");

    const loop = buildAgentLoop();
    await loop.tick(context);

    // First call should have user message
    const firstCall = (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstCall.messages[0].content).toBe("Hello");

    // Second call should NOT have a duplicate user message
    const secondCall = (mockActivities.agentLoopTurn as ReturnType<typeof vi.fn>).mock.calls[1][0];
    // Should have 3 messages: user("Hello") + assistant(tool_use) + user(tool_result)
    // NOT 4 (no extra "Hello" appended again)
    expect(secondCall.messages).toHaveLength(3);
    expect(secondCall.messages.filter((m: AgentMessage) => m.role === "user" && m.content === "Hello")).toHaveLength(1);
  });
});
