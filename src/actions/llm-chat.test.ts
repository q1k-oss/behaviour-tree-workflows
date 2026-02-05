/**
 * LLMChat Node Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScopedBlackboard } from "../blackboard.js";
import { Registry } from "../registry.js";
import {
  type TemporalContext,
  type BtreeActivities,
  type LLMChatResult,
  NodeStatus,
} from "../types.js";
import { LLMChat, type LLMChatConfig } from "./llm-chat.js";

describe("LLMChat Node", () => {
  let blackboard: ScopedBlackboard;
  let registry: Registry;

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    registry = new Registry();
    vi.clearAllMocks();
  });

  describe("Construction and validation", () => {
    it("should create node with valid config", () => {
      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        outputKey: "response",
      });

      expect(node).toBeDefined();
      expect(node.id).toBe("test");
    });

    it("should require provider", () => {
      expect(() => {
        new LLMChat({
          id: "test",
          model: "claude-sonnet-4-20250514",
          messages: [{ role: "user", content: "Hello" }],
          outputKey: "response",
        } as LLMChatConfig);
      }).toThrow(/requires provider/i);
    });

    it("should require model", () => {
      expect(() => {
        new LLMChat({
          id: "test",
          provider: "anthropic",
          messages: [{ role: "user", content: "Hello" }],
          outputKey: "response",
        } as LLMChatConfig);
      }).toThrow(/requires model/i);
    });

    it("should require at least one message", () => {
      expect(() => {
        new LLMChat({
          id: "test",
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          messages: [],
          outputKey: "response",
        });
      }).toThrow(/requires at least one message/i);
    });

    it("should require outputKey", () => {
      expect(() => {
        new LLMChat({
          id: "test",
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          messages: [{ role: "user", content: "Hello" }],
        } as LLMChatConfig);
      }).toThrow(/requires outputKey/i);
    });

    it("should accept optional temperature, maxTokens, systemPrompt, jsonSchema", () => {
      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        systemPrompt: "You are a helpful assistant.",
        temperature: 0.7,
        maxTokens: 1000,
        responseFormat: "json",
        jsonSchema: { type: "object" },
        timeout: 30000,
        outputKey: "response",
      });

      expect(node).toBeDefined();
    });

    it("should accept ollama with baseUrl", () => {
      const node = new LLMChat({
        id: "test",
        provider: "ollama",
        model: "llama2",
        messages: [{ role: "user", content: "Hello" }],
        baseUrl: "http://localhost:11434",
        outputKey: "response",
      });

      expect(node).toBeDefined();
    });
  });

  describe("Activity requirement", () => {
    it("should fail without llmChat activity", async () => {
      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: undefined,
      };

      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        outputKey: "response",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.llmChat");
    });

    it("should fail when activities object exists but llmChat is missing", async () => {
      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          // llmChat is not provided
        } as BtreeActivities,
      };

      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        outputKey: "response",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.llmChat");
    });
  });

  describe("Execution with activity", () => {
    const mockLLMResult: LLMChatResult = {
      content: "Hello! How can I help you today?",
      usage: {
        promptTokens: 10,
        completionTokens: 8,
        totalTokens: 18,
      },
      model: "claude-sonnet-4-20250514",
      finishReason: "stop",
    };

    it("should call activity with correct parameters", async () => {
      const mockLLMActivity = vi.fn().mockResolvedValue(mockLLMResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          llmChat: mockLLMActivity,
        },
      };

      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.7,
        maxTokens: 1000,
        outputKey: "response",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(mockLLMActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          messages: [{ role: "user", content: "Hello" }],
          temperature: 0.7,
          maxTokens: 1000,
        })
      );
    });

    it("should store result in blackboard", async () => {
      const mockLLMActivity = vi.fn().mockResolvedValue(mockLLMResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          llmChat: mockLLMActivity,
        },
      };

      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        outputKey: "llmResponse",
      });

      await node.tick(context);

      const stored = blackboard.get("llmResponse") as LLMChatResult;
      expect(stored.content).toBe("Hello! How can I help you today?");
      expect(stored.usage.totalTokens).toBe(18);
      expect(stored.finishReason).toBe("stop");
    });

    it("should resolve variables in message content from blackboard", async () => {
      blackboard.set("documentText", "This is a long document about AI.");

      const mockLLMActivity = vi.fn().mockResolvedValue(mockLLMResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          llmChat: mockLLMActivity,
        },
      };

      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Summarize: ${bb.documentText}" }],
        outputKey: "response",
      });

      await node.tick(context);

      expect(mockLLMActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: "user", content: "Summarize: This is a long document about AI." },
          ],
        })
      );
    });

    it("should resolve variables in message content from input", async () => {
      const mockLLMActivity = vi.fn().mockResolvedValue(mockLLMResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        input: { userQuery: "What is machine learning?" },
        activities: {
          executePieceAction: vi.fn(),
          llmChat: mockLLMActivity,
        },
      };

      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "${input.userQuery}" }],
        outputKey: "response",
      });

      await node.tick(context);

      expect(mockLLMActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: "user", content: "What is machine learning?" }],
        })
      );
    });

    it("should resolve systemPrompt variables", async () => {
      blackboard.set("assistantRole", "data analyst");

      const mockLLMActivity = vi.fn().mockResolvedValue(mockLLMResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          llmChat: mockLLMActivity,
        },
      };

      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        systemPrompt: "You are a ${bb.assistantRole}.",
        messages: [{ role: "user", content: "Hello" }],
        outputKey: "response",
      });

      await node.tick(context);

      expect(mockLLMActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: "You are a data analyst.",
        })
      );
    });

    it("should resolve model from blackboard", async () => {
      blackboard.set("selectedModel", "gpt-4");

      const mockLLMActivity = vi.fn().mockResolvedValue(mockLLMResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          llmChat: mockLLMActivity,
        },
      };

      const node = new LLMChat({
        id: "test",
        provider: "openai",
        model: "${bb.selectedModel}",
        messages: [{ role: "user", content: "Hello" }],
        outputKey: "response",
      });

      await node.tick(context);

      expect(mockLLMActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-4",
        })
      );
    });

    it("should pass JSON response format and schema", async () => {
      const jsonResult: LLMChatResult = {
        content: '{"summary": "AI is transforming industries."}',
        parsed: { summary: "AI is transforming industries." },
        usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
        model: "claude-sonnet-4-20250514",
        finishReason: "stop",
      };

      const mockLLMActivity = vi.fn().mockResolvedValue(jsonResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          llmChat: mockLLMActivity,
        },
      };

      const jsonSchema = {
        type: "object",
        properties: {
          summary: { type: "string" },
        },
      };

      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Summarize AI" }],
        responseFormat: "json",
        jsonSchema,
        outputKey: "response",
      });

      await node.tick(context);

      expect(mockLLMActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          responseFormat: "json",
          jsonSchema,
        })
      );

      const stored = blackboard.get("response") as LLMChatResult;
      expect(stored.parsed).toEqual({ summary: "AI is transforming industries." });
    });

    it("should pass timeout to activity", async () => {
      const mockLLMActivity = vi.fn().mockResolvedValue(mockLLMResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          llmChat: mockLLMActivity,
        },
      };

      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        timeout: 30000,
        outputKey: "response",
      });

      await node.tick(context);

      expect(mockLLMActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
        })
      );
    });

    it("should pass baseUrl for ollama", async () => {
      const mockLLMActivity = vi.fn().mockResolvedValue(mockLLMResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          llmChat: mockLLMActivity,
        },
      };

      const node = new LLMChat({
        id: "test",
        provider: "ollama",
        model: "llama2",
        messages: [{ role: "user", content: "Hello" }],
        baseUrl: "http://localhost:11434",
        outputKey: "response",
      });

      await node.tick(context);

      expect(mockLLMActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "ollama",
          baseUrl: "http://localhost:11434",
        })
      );
    });

    it("should return SUCCESS when finishReason is stop", async () => {
      const mockLLMActivity = vi.fn().mockResolvedValue({
        ...mockLLMResult,
        finishReason: "stop",
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          llmChat: mockLLMActivity,
        },
      };

      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        outputKey: "response",
      });

      const status = await node.tick(context);
      expect(status).toBe(NodeStatus.SUCCESS);
    });

    it("should return SUCCESS when finishReason is length", async () => {
      const mockLLMActivity = vi.fn().mockResolvedValue({
        ...mockLLMResult,
        finishReason: "length",
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          llmChat: mockLLMActivity,
        },
      };

      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        outputKey: "response",
      });

      const status = await node.tick(context);
      expect(status).toBe(NodeStatus.SUCCESS);
    });
  });

  describe("Error handling", () => {
    it("should return FAILURE and set lastError when activity throws", async () => {
      const mockLLMActivity = vi
        .fn()
        .mockRejectedValue(new Error("API rate limit exceeded"));

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          llmChat: mockLLMActivity,
        },
      };

      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        outputKey: "response",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("API rate limit exceeded");
    });

    it("should return FAILURE when finishReason is error", async () => {
      const errorResult: LLMChatResult = {
        content: "Content filter triggered",
        usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
        model: "claude-sonnet-4-20250514",
        finishReason: "error",
      };

      const mockLLMActivity = vi.fn().mockResolvedValue(errorResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          llmChat: mockLLMActivity,
        },
      };

      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        outputKey: "response",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("LLM returned error");
    });

    it("should still store result in blackboard on LLM error for debugging", async () => {
      const errorResult: LLMChatResult = {
        content: "Content filter triggered",
        usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
        model: "claude-sonnet-4-20250514",
        finishReason: "error",
      };

      const mockLLMActivity = vi.fn().mockResolvedValue(errorResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          llmChat: mockLLMActivity,
        },
      };

      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        outputKey: "response",
      });

      await node.tick(context);

      // Result should still be stored for debugging
      const stored = blackboard.get("response") as LLMChatResult;
      expect(stored).toBeDefined();
      expect(stored.finishReason).toBe("error");
    });

    it("should handle timeout errors from activity", async () => {
      const mockLLMActivity = vi
        .fn()
        .mockRejectedValue(new Error("Request timeout after 30000ms"));

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          llmChat: mockLLMActivity,
        },
      };

      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        outputKey: "response",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("timeout");
    });
  });

  describe("Node lifecycle", () => {
    it("should clone correctly", () => {
      const node = new LLMChat({
        id: "original",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        systemPrompt: "You are helpful.",
        temperature: 0.5,
        outputKey: "response",
      });

      const cloned = node.clone() as LLMChat;

      expect(cloned.id).toBe("original");
    });

    it("should reset status correctly", async () => {
      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        // No activities - will fail
      };

      const node = new LLMChat({
        id: "test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        outputKey: "response",
      });

      await node.tick(context);
      expect(node.status()).toBe(NodeStatus.FAILURE);

      node.reset();
      expect(node.status()).toBe(NodeStatus.IDLE);
      expect(node.lastError).toBeUndefined();
    });
  });

  describe("Provider support", () => {
    const providers = ["anthropic", "openai", "google", "ollama"] as const;

    for (const provider of providers) {
      it(`should support ${provider} provider`, async () => {
        const mockLLMActivity = vi.fn().mockResolvedValue({
          content: "Response",
          usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
          model: "test-model",
          finishReason: "stop",
        });

        const context: TemporalContext = {
          blackboard,
          treeRegistry: registry,
          timestamp: Date.now(),
          deltaTime: 0,
          activities: {
            executePieceAction: vi.fn(),
            llmChat: mockLLMActivity,
          },
        };

        const node = new LLMChat({
          id: `test-${provider}`,
          provider,
          model: "test-model",
          messages: [{ role: "user", content: "Hello" }],
          outputKey: "response",
        });

        const status = await node.tick(context);

        expect(status).toBe(NodeStatus.SUCCESS);
        expect(mockLLMActivity).toHaveBeenCalledWith(
          expect.objectContaining({ provider })
        );
      });
    }
  });
});
