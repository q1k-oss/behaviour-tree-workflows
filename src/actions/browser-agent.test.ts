/**
 * BrowserAgent Node Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScopedBlackboard } from "../blackboard.js";
import { Registry } from "../registry.js";
import {
  type TemporalContext,
  type BtreeActivities,
  type BrowserAgentResult,
  NodeStatus,
} from "../types.js";
import { BrowserAgent, type BrowserAgentConfig } from "./browser-agent.js";

describe("BrowserAgent Node", () => {
  let blackboard: ScopedBlackboard;
  let registry: Registry;

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    registry = new Registry();
    vi.clearAllMocks();
  });

  // Helper to create a successful result
  const createSuccessResult = (
    overrides?: Partial<BrowserAgentResult>
  ): BrowserAgentResult => ({
    success: true,
    completed: true,
    message: "Successfully completed the goal",
    actions: [
      {
        type: "act",
        reasoning: "Clicking the search button",
        taskCompleted: true,
        pageUrl: "https://google.com",
        timestamp: Date.now(),
      },
    ],
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 20,
    },
    sessionId: "session-123",
    debugUrl: "https://browserbase.com/sessions/session-123",
    finalUrl: "https://google.com/search?q=test",
    contextId: "context-456",
    executionTimeMs: 5000,
    ...overrides,
  });

  describe("Construction and validation", () => {
    it("should create node with valid config", () => {
      const node = new BrowserAgent({
        id: "test",
        goal: "Search for weather in NYC",
        outputKey: "result",
      });

      expect(node).toBeDefined();
      expect(node.id).toBe("test");
    });

    it("should require goal", () => {
      expect(() => {
        new BrowserAgent({
          id: "test",
          outputKey: "result",
        } as BrowserAgentConfig);
      }).toThrow(/requires goal/i);
    });

    it("should require outputKey", () => {
      expect(() => {
        new BrowserAgent({
          id: "test",
          goal: "Search for something",
        } as BrowserAgentConfig);
      }).toThrow(/requires outputKey/i);
    });

    it("should accept optional startUrl, contextKey, persistContext, timeout, maxSteps", () => {
      const node = new BrowserAgent({
        id: "test",
        goal: "Search for weather",
        startUrl: "https://google.com",
        contextKey: "browserContext",
        persistContext: true,
        timeout: 60000,
        maxSteps: 15,
        outputKey: "result",
      });

      expect(node).toBeDefined();
    });

    it("should accept optional llmProvider and llmModel", () => {
      const node = new BrowserAgent({
        id: "test",
        goal: "Search for weather",
        llmProvider: "anthropic",
        llmModel: "claude-sonnet-4-20250514",
        outputKey: "result",
      });

      expect(node).toBeDefined();
    });
  });

  describe("Activity requirement", () => {
    it("should fail without browserAgent activity", async () => {
      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: undefined,
      };

      const node = new BrowserAgent({
        id: "test",
        goal: "Search for weather",
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.browserAgent");
    });

    it("should fail when activities object exists but browserAgent is missing", async () => {
      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          // browserAgent is not provided
        } as BtreeActivities,
      };

      const node = new BrowserAgent({
        id: "test",
        goal: "Search for weather",
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.browserAgent");
    });
  });

  describe("Execution with activity", () => {
    it("should call activity with correct parameters", async () => {
      const mockResult = createSuccessResult();
      const mockBrowserActivity = vi.fn().mockResolvedValue(mockResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          browserAgent: mockBrowserActivity,
        },
      };

      const node = new BrowserAgent({
        id: "test",
        goal: "Search for weather in NYC",
        startUrl: "https://google.com",
        timeout: 60000,
        maxSteps: 15,
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(mockBrowserActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          goal: "Search for weather in NYC",
          startUrl: "https://google.com",
          timeout: 60000,
          maxSteps: 15,
        })
      );
    });

    it("should store result in blackboard", async () => {
      const mockResult = createSuccessResult({
        message: "Found weather: 72°F in NYC",
      });
      const mockBrowserActivity = vi.fn().mockResolvedValue(mockResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          browserAgent: mockBrowserActivity,
        },
      };

      const node = new BrowserAgent({
        id: "test",
        goal: "Search for weather",
        outputKey: "searchResult",
      });

      await node.tick(context);

      const stored = blackboard.get("searchResult") as BrowserAgentResult;
      expect(stored.success).toBe(true);
      expect(stored.message).toBe("Found weather: 72°F in NYC");
      expect(stored.debugUrl).toBe("https://browserbase.com/sessions/session-123");
    });

    it("should resolve variables in goal from blackboard", async () => {
      blackboard.set("searchQuery", "restaurants near me");

      const mockResult = createSuccessResult();
      const mockBrowserActivity = vi.fn().mockResolvedValue(mockResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          browserAgent: mockBrowserActivity,
        },
      };

      const node = new BrowserAgent({
        id: "test",
        goal: "Search for ${bb.searchQuery}",
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockBrowserActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          goal: "Search for restaurants near me",
        })
      );
    });

    it("should resolve variables in goal from input", async () => {
      const mockResult = createSuccessResult();
      const mockBrowserActivity = vi.fn().mockResolvedValue(mockResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        input: { username: "testuser", password: "secret123" },
        activities: {
          executePieceAction: vi.fn(),
          browserAgent: mockBrowserActivity,
        },
      };

      const node = new BrowserAgent({
        id: "test",
        goal: "Login with username ${input.username} and password ${input.password}",
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockBrowserActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          goal: "Login with username testuser and password secret123",
        })
      );
    });

    it("should resolve variables in startUrl", async () => {
      const mockResult = createSuccessResult();
      const mockBrowserActivity = vi.fn().mockResolvedValue(mockResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        input: { targetUrl: "https://example.com/login" },
        activities: {
          executePieceAction: vi.fn(),
          browserAgent: mockBrowserActivity,
        },
      };

      const node = new BrowserAgent({
        id: "test",
        goal: "Login to the site",
        startUrl: "${input.targetUrl}",
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockBrowserActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          startUrl: "https://example.com/login",
        })
      );
    });

    it("should pass contextId from blackboard when contextKey provided", async () => {
      blackboard.set("browserContext", "existing-context-123");

      const mockResult = createSuccessResult();
      const mockBrowserActivity = vi.fn().mockResolvedValue(mockResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          browserAgent: mockBrowserActivity,
        },
      };

      const node = new BrowserAgent({
        id: "test",
        goal: "Navigate to dashboard",
        contextKey: "browserContext",
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockBrowserActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          contextId: "existing-context-123",
        })
      );
    });

    it("should store result.contextId in blackboard for continuation", async () => {
      const mockResult = createSuccessResult({ contextId: "new-context-789" });
      const mockBrowserActivity = vi.fn().mockResolvedValue(mockResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          browserAgent: mockBrowserActivity,
        },
      };

      const node = new BrowserAgent({
        id: "test",
        goal: "Login to site",
        contextKey: "browserContext",
        persistContext: true,
        outputKey: "result",
      });

      await node.tick(context);

      expect(blackboard.get("browserContext")).toBe("new-context-789");
    });

    it("should pass llmProvider and llmModel to activity", async () => {
      const mockResult = createSuccessResult();
      const mockBrowserActivity = vi.fn().mockResolvedValue(mockResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          browserAgent: mockBrowserActivity,
        },
      };

      const node = new BrowserAgent({
        id: "test",
        goal: "Search for weather",
        llmProvider: "openai",
        llmModel: "gpt-4",
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockBrowserActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          llmProvider: "openai",
          llmModel: "gpt-4",
        })
      );
    });

    it("should return SUCCESS when result.success and result.completed are true", async () => {
      const mockResult = createSuccessResult({
        success: true,
        completed: true,
      });
      const mockBrowserActivity = vi.fn().mockResolvedValue(mockResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          browserAgent: mockBrowserActivity,
        },
      };

      const node = new BrowserAgent({
        id: "test",
        goal: "Search for weather",
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
    });
  });

  describe("Error handling", () => {
    it("should return FAILURE when activity throws", async () => {
      const mockBrowserActivity = vi
        .fn()
        .mockRejectedValue(new Error("Browserbase API error: Session failed"));

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          browserAgent: mockBrowserActivity,
        },
      };

      const node = new BrowserAgent({
        id: "test",
        goal: "Search for weather",
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("Browserbase API error");
    });

    it("should return FAILURE when result.success is false (goal not achieved)", async () => {
      const mockResult = createSuccessResult({
        success: false,
        completed: true,
        message: "Could not find the login button",
      });
      const mockBrowserActivity = vi.fn().mockResolvedValue(mockResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          browserAgent: mockBrowserActivity,
        },
      };

      const node = new BrowserAgent({
        id: "test",
        goal: "Login to the site",
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("failed to achieve goal");
      expect(node.lastError).toContain("Could not find the login button");
    });

    it("should return FAILURE when result.completed is false (hit maxSteps)", async () => {
      const mockResult = createSuccessResult({
        success: true,
        completed: false,
        message: "Reached maximum steps before completing",
      });
      const mockBrowserActivity = vi.fn().mockResolvedValue(mockResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          browserAgent: mockBrowserActivity,
        },
      };

      const node = new BrowserAgent({
        id: "test",
        goal: "Complete a complex multi-step task",
        maxSteps: 5,
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("hit step limit");
    });

    it("should still store result in blackboard on failure (debugUrl for audit)", async () => {
      const mockResult = createSuccessResult({
        success: false,
        message: "Failed to find element",
        debugUrl: "https://browserbase.com/sessions/failed-session",
      });
      const mockBrowserActivity = vi.fn().mockResolvedValue(mockResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          browserAgent: mockBrowserActivity,
        },
      };

      const node = new BrowserAgent({
        id: "test",
        goal: "Find and click button",
        outputKey: "result",
      });

      await node.tick(context);

      // Result should still be stored for debugging
      const stored = blackboard.get("result") as BrowserAgentResult;
      expect(stored).toBeDefined();
      expect(stored.debugUrl).toBe(
        "https://browserbase.com/sessions/failed-session"
      );
    });

    it("should still store contextId on failure (for debugging session)", async () => {
      const mockResult = createSuccessResult({
        success: false,
        contextId: "context-for-debugging",
      });
      const mockBrowserActivity = vi.fn().mockResolvedValue(mockResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          browserAgent: mockBrowserActivity,
        },
      };

      const node = new BrowserAgent({
        id: "test",
        goal: "Login to site",
        contextKey: "browserContext",
        outputKey: "result",
      });

      await node.tick(context);

      // ContextId should still be stored for debugging
      expect(blackboard.get("browserContext")).toBe("context-for-debugging");
    });

    it("should handle timeout errors from activity", async () => {
      const mockBrowserActivity = vi
        .fn()
        .mockRejectedValue(new Error("Timeout: Agent execution exceeded 60000ms"));

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          browserAgent: mockBrowserActivity,
        },
      };

      const node = new BrowserAgent({
        id: "test",
        goal: "Search for weather",
        timeout: 60000,
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("Timeout");
    });
  });

  describe("Node lifecycle", () => {
    it("should clone correctly", () => {
      const node = new BrowserAgent({
        id: "original",
        goal: "Search for weather",
        startUrl: "https://google.com",
        contextKey: "browserCtx",
        persistContext: true,
        outputKey: "result",
      });

      const cloned = node.clone() as BrowserAgent;

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

      const node = new BrowserAgent({
        id: "test",
        goal: "Search for weather",
        outputKey: "result",
      });

      await node.tick(context);
      expect(node.status()).toBe(NodeStatus.FAILURE);

      node.reset();
      expect(node.status()).toBe(NodeStatus.IDLE);
      expect(node.lastError).toBeUndefined();
    });
  });

  describe("Multi-step workflow simulation", () => {
    it("should support context continuation across multiple calls", async () => {
      // First call - login
      const loginResult = createSuccessResult({
        message: "Logged in successfully",
        contextId: "session-with-auth",
      });
      const mockBrowserActivity = vi
        .fn()
        .mockResolvedValueOnce(loginResult)
        .mockResolvedValueOnce(
          createSuccessResult({
            message: "Extracted dashboard data",
            contextId: "session-with-auth",
          })
        );

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          browserAgent: mockBrowserActivity,
        },
      };

      // Step 1: Login
      const loginNode = new BrowserAgent({
        id: "login",
        goal: "Login to site",
        startUrl: "https://example.com/login",
        contextKey: "browserSession",
        persistContext: true,
        outputKey: "loginResult",
      });

      await loginNode.tick(context);

      // Verify contextId was stored
      expect(blackboard.get("browserSession")).toBe("session-with-auth");

      // Step 2: Scrape (should use the stored contextId)
      const scrapeNode = new BrowserAgent({
        id: "scrape",
        goal: "Extract dashboard data",
        contextKey: "browserSession",
        outputKey: "scrapeResult",
      });

      await scrapeNode.tick(context);

      // Second call should have received the contextId from blackboard
      expect(mockBrowserActivity).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          contextId: "session-with-auth",
        })
      );
    });
  });
});
