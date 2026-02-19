/**
 * Integration tests for the AI SDK module.
 *
 * Tests createAIActivities() wired up with the behavior tree agent loop
 * (While + LLMToolCall + ToolExecutor + SetVariable) to verify end-to-end
 * that the AI SDK activity layer works correctly with the tree nodes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LanguageModel } from "ai";
import { createAIActivities } from "./index.js";
import type { CreateAIActivitiesOptions } from "./types.js";
import type {
  TemporalContext,
  BtreeActivities,
  AgentMessage,
  AgentContentBlock,
  AgentLoopTurnResult,
} from "../types.js";
import { While } from "../composites/while.js";
import { Sequence } from "../composites/sequence.js";
import { Conditional } from "../composites/conditional.js";
import { CheckCondition } from "../test-nodes.js";
import { LLMToolCall } from "../actions/llm-tool-call.js";
import { ToolExecutor } from "../actions/tool-executor.js";
import { SetVariable } from "../utilities/set-variable.js";
import { ScopedBlackboard } from "../blackboard.js";
import { NodeStatus } from "../types.js";

// Mock the AI SDK module at the top level
vi.mock("ai", async () => {
  const actual = await vi.importActual("ai");
  return {
    ...actual,
    generateText: vi.fn(),
    generateObject: vi.fn(),
    streamText: vi.fn(),
  };
});

import { generateText } from "ai";

const mockGenerateText = generateText as ReturnType<typeof vi.fn>;

describe("AI SDK Integration", () => {
  const mockModel = { modelId: "test-model" } as unknown as LanguageModel;
  const mockProviderFn = vi.fn().mockReturnValue(mockModel);

  let options: CreateAIActivitiesOptions;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    options = {
      providers: {
        anthropic: mockProviderFn,
      },
    };
  });

  describe("createAIActivities", () => {
    it("should return an object with llmChat and agentLoopTurn functions", () => {
      const activities = createAIActivities(options);

      expect(activities.llmChat).toBeDefined();
      expect(typeof activities.llmChat).toBe("function");
      expect(activities.agentLoopTurn).toBeDefined();
      expect(typeof activities.agentLoopTurn).toBe("function");
    });

    it("should only return llmChat and agentLoopTurn (not other activities)", () => {
      const activities = createAIActivities(options);
      const keys = Object.keys(activities);

      expect(keys).toContain("llmChat");
      expect(keys).toContain("agentLoopTurn");
      expect(keys).toHaveLength(2);
    });
  });

  describe("Full agent loop with AI SDK activities", () => {
    let blackboard: ScopedBlackboard;
    let mockExecuteAgentTool: ReturnType<typeof vi.fn>;
    let context: TemporalContext;

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
            inputSchema: {
              type: "object",
              properties: { city: { type: "string" } },
            },
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

      // Then: ToolExecutor
      const toolExec = new ToolExecutor({
        id: "exec-tools",
        responseKey: "llmResponse",
        messagesKey: "messages",
      });
      conditional.addChild(toolExec);

      // Else: SetVariable(agentLooping = false)
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

    beforeEach(() => {
      blackboard = new ScopedBlackboard();
      mockExecuteAgentTool = vi.fn();

      // Create AI SDK activities and merge with tool executor
      const aiActivities = createAIActivities(options);
      const activities: BtreeActivities = {
        ...aiActivities,
        executeAgentTool: mockExecuteAgentTool,
        executePieceAction: vi.fn(),
      } as unknown as BtreeActivities;

      context = {
        blackboard,
        timestamp: Date.now(),
        deltaTime: 0,
        activities,
      };
    });

    it("should complete a single-turn agent loop (text response, no tools)", async () => {
      // Mock AI SDK generateText for a simple text response
      mockGenerateText.mockResolvedValue({
        text: "Hello! I'm here to help.",
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
      });

      blackboard.set("agentLooping", true);
      blackboard.set("userMessage", "Hello");

      const loop = buildAgentLoop();
      const result = await loop.tick(context);

      // While exits with SUCCESS when agentLooping becomes false
      expect(result).toBe(NodeStatus.SUCCESS);

      // AI SDK generateText was called once
      expect(mockGenerateText).toHaveBeenCalledTimes(1);

      // Verify the call went through the AI SDK layer correctly
      const callArgs = mockGenerateText.mock.calls[0][0];
      expect(callArgs.model).toBe(mockModel);
      // Messages should include system prompt and user message
      expect(callArgs.messages.length).toBeGreaterThanOrEqual(2);
      expect(callArgs.messages[0].role).toBe("system");
      expect(callArgs.messages[1].role).toBe("user");
      expect(callArgs.messages[1].content).toBe("Hello");

      // No tools executed
      expect(mockExecuteAgentTool).not.toHaveBeenCalled();

      // agentLooping should be false
      expect(blackboard.get("agentLooping")).toBe(false);

      // Conversation should have user + assistant messages
      const messages = blackboard.get("messages") as AgentMessage[];
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("user");
      expect(messages[1].role).toBe("assistant");
      expect(messages[1].content).toBe("Hello! I'm here to help.");
    });

    it("should complete a two-turn agent loop (tool_use -> tool_result -> end_turn)", async () => {
      // First call: LLM requests a tool via AI SDK
      mockGenerateText.mockResolvedValueOnce({
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

      // Second call: LLM responds with final answer
      mockGenerateText.mockResolvedValueOnce({
        text: "The weather in San Francisco is 72F and sunny!",
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
      });

      // Mock tool execution
      mockExecuteAgentTool.mockResolvedValue({
        content: '{"temp": "72F", "condition": "sunny"}',
        isError: false,
      });

      blackboard.set("agentLooping", true);
      blackboard.set("userMessage", "What's the weather in SF?");

      const loop = buildAgentLoop();
      const result = await loop.tick(context);

      expect(result).toBe(NodeStatus.SUCCESS);

      // AI SDK generateText called twice
      expect(mockGenerateText).toHaveBeenCalledTimes(2);

      // Tool executed once
      expect(mockExecuteAgentTool).toHaveBeenCalledTimes(1);
      expect(mockExecuteAgentTool).toHaveBeenCalledWith({
        toolName: "get_weather",
        toolInput: { city: "San Francisco" },
      });

      // Verify conversation
      const messages = blackboard.get("messages") as AgentMessage[];
      // user -> assistant(tool_use) -> user(tool_result) -> assistant(end_turn)
      expect(messages).toHaveLength(4);

      // Message 0: user
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("What's the weather in SF?");

      // Message 1: assistant with tool_use blocks
      expect(messages[1].role).toBe("assistant");
      const assistantContent = messages[1].content as AgentContentBlock[];
      expect(Array.isArray(assistantContent)).toBe(true);
      expect(assistantContent.some((b) => b.type === "tool_use")).toBe(true);

      // Message 2: user with tool_result blocks
      expect(messages[2].role).toBe("user");
      const toolResultContent = messages[2].content as AgentContentBlock[];
      expect(Array.isArray(toolResultContent)).toBe(true);
      expect(toolResultContent[0].type).toBe("tool_result");

      // Message 3: assistant final answer
      expect(messages[3].role).toBe("assistant");
      expect(messages[3].content).toBe(
        "The weather in San Francisco is 72F and sunny!"
      );

      // Final response on blackboard
      const response = blackboard.get("llmResponse") as Record<string, unknown>;
      expect(response.content).toBe(
        "The weather in San Francisco is 72F and sunny!"
      );
      expect(response.stopReason).toBe("end_turn");

      // Second call to AI SDK should include the full conversation history
      const secondCallArgs = mockGenerateText.mock.calls[1][0];
      // Should have: system + user + assistant(tool-call) + tool(tool-result)
      expect(secondCallArgs.messages.length).toBeGreaterThanOrEqual(4);
    });

    it("should handle tool execution error and feed it back to the LLM", async () => {
      // First call: LLM requests a tool
      mockGenerateText.mockResolvedValueOnce({
        text: "Let me try.",
        toolCalls: [
          { toolCallId: "tc_1", toolName: "bad_tool", input: {} },
        ],
        finishReason: "tool-calls",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      });

      // Second call: LLM recovers after seeing the error
      mockGenerateText.mockResolvedValueOnce({
        text: "That tool failed, but I can help another way.",
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 30, outputTokens: 15, totalTokens: 45 },
      });

      mockExecuteAgentTool.mockResolvedValue({
        content: "Unknown tool: bad_tool",
        isError: true,
      });

      blackboard.set("agentLooping", true);
      blackboard.set("userMessage", "Do something");

      const loop = buildAgentLoop();
      const result = await loop.tick(context);

      expect(result).toBe(NodeStatus.SUCCESS);
      expect(mockGenerateText).toHaveBeenCalledTimes(2);

      // Verify error was fed back in the conversation
      const messages = blackboard.get("messages") as AgentMessage[];
      const toolResultMsg = messages[2];
      const blocks = toolResultMsg.content as AgentContentBlock[];
      expect((blocks[0] as { type: string; is_error?: boolean }).is_error).toBe(true);
    });

    it("should handle generateText throwing an error mid-loop", async () => {
      // First call succeeds with tool_use
      mockGenerateText.mockResolvedValueOnce({
        text: "Checking...",
        toolCalls: [
          { toolCallId: "tc_1", toolName: "get_weather", input: { city: "SF" } },
        ],
        finishReason: "tool-calls",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      });

      // Second call fails with API error
      mockGenerateText.mockRejectedValueOnce(new Error("API rate limit exceeded"));

      mockExecuteAgentTool.mockResolvedValue({
        content: "72F",
        isError: false,
      });

      blackboard.set("agentLooping", true);
      blackboard.set("userMessage", "Weather?");

      const loop = buildAgentLoop();
      const result = await loop.tick(context);

      // The error propagates up through the tree
      expect(result).toBe(NodeStatus.FAILURE);
      expect(mockGenerateText).toHaveBeenCalledTimes(2);
    });
  });
});
