/**
 * IntegrationAction Node Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScopedBlackboard } from "../blackboard.js";
import { Registry } from "../registry.js";
import { type TemporalContext, NodeStatus } from "../types.js";
import {
  IntegrationAction,
  type IntegrationActionConfig,
  type IntegrationContext,
  type TokenProvider,
  envTokenProvider,
} from "./integration-action.js";
import type { PieceAuth } from "./piece-executor.js";

describe("IntegrationAction Node", () => {
  let blackboard: ScopedBlackboard;
  let registry: Registry;
  let context: IntegrationContext;

  // Mock token provider that returns a test token
  const mockTokenProvider: TokenProvider = vi.fn(async () => ({
    access_token: "test_token_123",
  }));

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    registry = new Registry();
    vi.clearAllMocks();

    context = {
      blackboard,
      treeRegistry: registry,
      timestamp: Date.now(),
      deltaTime: 0,
      tokenProvider: mockTokenProvider,
      tenantId: "tenant-123",
      userId: "user-456",
    };
  });

  describe("Construction and validation", () => {
    it("should create node with valid config", () => {
      const node = new IntegrationAction({
        id: "test-action",
        provider: "google-sheets",
        action: "append_row",
        inputs: { spreadsheetId: "123" },
      });

      expect(node).toBeDefined();
      expect(node.id).toBe("test-action");
    });

    it("should require provider", () => {
      expect(() => {
        new IntegrationAction({
          id: "test",
          action: "test",
        } as unknown as IntegrationActionConfig);
      }).toThrow(/requires provider/i);
    });

    it("should require action", () => {
      expect(() => {
        new IntegrationAction({
          id: "test",
          provider: "google-sheets",
        } as unknown as IntegrationActionConfig);
      }).toThrow(/requires action/i);
    });

    it("should accept empty inputs", () => {
      const node = new IntegrationAction({
        id: "test",
        provider: "slack",
        action: "send_message",
      });
      expect(node).toBeDefined();
    });
  });

  describe("Blackboard variable resolution", () => {
    it("should resolve simple ${bb.key} references", () => {
      blackboard.set("spreadsheetId", "sheet-123");
      blackboard.set("sheetName", "Orders");

      const node = new IntegrationAction({
        id: "test",
        provider: "google-sheets",
        action: "append_row",
        inputs: {
          spreadsheetId: "${bb.spreadsheetId}",
          sheetName: "${bb.sheetName}",
        },
      });

      // Access private method via any
      const resolvedInputs = (node as any).resolveInputs(context);

      expect(resolvedInputs.spreadsheetId).toBe("sheet-123");
      expect(resolvedInputs.sheetName).toBe("Orders");
    });

    it("should resolve nested ${bb.nested.key} references", () => {
      blackboard.set("user", {
        profile: {
          name: "John Doe",
          email: "john@example.com",
        },
      });

      const node = new IntegrationAction({
        id: "test",
        provider: "slack",
        action: "send_message",
        inputs: {
          text: "${bb.user.profile.name}",
        },
      });

      const resolvedInputs = (node as any).resolveInputs(context);

      expect(resolvedInputs.text).toBe("John Doe");
    });

    it("should handle template interpolation", () => {
      blackboard.set("orderId", "ORD-123");
      blackboard.set("customerName", "Jane");

      const node = new IntegrationAction({
        id: "test",
        provider: "slack",
        action: "send_message",
        inputs: {
          text: "New order ${bb.orderId} from ${bb.customerName}!",
        },
      });

      const resolvedInputs = (node as any).resolveInputs(context);

      expect(resolvedInputs.text).toBe("New order ORD-123 from Jane!");
    });

    it("should resolve arrays with ${bb.key} references", () => {
      blackboard.set("col1", "A");
      blackboard.set("col2", "B");
      blackboard.set("col3", "C");

      const node = new IntegrationAction({
        id: "test",
        provider: "google-sheets",
        action: "append_row",
        inputs: {
          values: ["${bb.col1}", "${bb.col2}", "${bb.col3}"],
        },
      });

      const resolvedInputs = (node as any).resolveInputs(context);

      expect(resolvedInputs.values).toEqual(["A", "B", "C"]);
    });

    it("should preserve non-string values", () => {
      blackboard.set("count", 42);
      blackboard.set("active", true);

      const node = new IntegrationAction({
        id: "test",
        provider: "test",
        action: "test",
        inputs: {
          // Full reference returns the actual value
          numericValue: "${bb.count}",
          boolValue: "${bb.active}",
          // Static values
          staticNum: 100,
          staticBool: false,
        },
      });

      const resolvedInputs = (node as any).resolveInputs(context);

      expect(resolvedInputs.numericValue).toBe(42);
      expect(resolvedInputs.boolValue).toBe(true);
      expect(resolvedInputs.staticNum).toBe(100);
      expect(resolvedInputs.staticBool).toBe(false);
    });

    it("should return empty string for undefined references in template", () => {
      const node = new IntegrationAction({
        id: "test",
        provider: "test",
        action: "test",
        inputs: {
          text: "Hello ${bb.undefinedKey}!",
        },
      });

      const resolvedInputs = (node as any).resolveInputs(context);

      expect(resolvedInputs.text).toBe("Hello !");
    });

    it("should return undefined for full undefined reference", () => {
      const node = new IntegrationAction({
        id: "test",
        provider: "test",
        action: "test",
        inputs: {
          value: "${bb.undefinedKey}",
        },
      });

      const resolvedInputs = (node as any).resolveInputs(context);

      expect(resolvedInputs.value).toBeUndefined();
    });
  });

  describe("Token provider integration", () => {
    it("should fail without token provider in context", async () => {
      const contextWithoutProvider: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
      };

      const node = new IntegrationAction({
        id: "test",
        provider: "google-sheets",
        action: "append_row",
      });

      const status = await node.tick(contextWithoutProvider);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("No token provider");
    });

    it("should call token provider with correct arguments", async () => {
      // Mock the piece execution to avoid actual API calls
      vi.mock("./piece-executor.js", () => ({
        executePieceAction: vi.fn().mockResolvedValue({ success: true }),
      }));

      const node = new IntegrationAction({
        id: "test",
        provider: "slack",
        action: "send_message",
        connectionId: "conn-789",
      });

      // We expect failure due to piece not being installed, but token provider should be called
      await node.tick(context);

      expect(mockTokenProvider).toHaveBeenCalledWith(
        context,
        "slack",
        "conn-789"
      );
    });
  });

  describe("Result storage", () => {
    it("should store result in default key by default", async () => {
      // This test verifies the storeResult logic
      const node = new IntegrationAction({
        id: "my-action",
        provider: "test",
        action: "test",
      });

      // Verify default resultKey
      expect((node as any).resultKey).toBe("my-action.result");
      expect((node as any).storeResult).toBe(true);
    });

    it("should use custom result key when specified", () => {
      const node = new IntegrationAction({
        id: "test",
        provider: "test",
        action: "test",
        resultKey: "custom.result.key",
      });

      expect((node as any).resultKey).toBe("custom.result.key");
    });

    it("should not store result when storeResult is false", () => {
      const node = new IntegrationAction({
        id: "test",
        provider: "test",
        action: "test",
        storeResult: false,
      });

      expect((node as any).storeResult).toBe(false);
    });
  });

  describe("Node lifecycle", () => {
    it("should clone correctly", () => {
      const node = new IntegrationAction({
        id: "original",
        provider: "google-sheets",
        action: "append_row",
        inputs: { test: "value" },
      });

      const cloned = node.clone() as IntegrationAction;

      expect(cloned.id).toBe("original");
      expect((cloned as any).provider).toBe("google-sheets");
      expect((cloned as any).action).toBe("append_row");
    });

    it("should reset status correctly", async () => {
      const node = new IntegrationAction({
        id: "test",
        provider: "test",
        action: "test",
      });

      // Trigger failure (no token provider)
      await node.tick({
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
      });

      expect(node.status()).toBe(NodeStatus.FAILURE);

      node.reset();

      expect(node.status()).toBe(NodeStatus.IDLE);
      expect(node.lastError).toBeUndefined();
    });
  });
});

describe("Activity execution mode", () => {
  let blackboard: ScopedBlackboard;
  let registry: Registry;

  // Mock token provider that returns a test token
  const mockTokenProvider: TokenProvider = vi.fn(async () => ({
    access_token: "test_token_123",
  }));

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    registry = new Registry();
    vi.clearAllMocks();
  });

  it("should use activity when provided in context", async () => {
    const mockActivity = vi.fn().mockResolvedValue({ success: true });

    const context: IntegrationContext = {
      blackboard,
      treeRegistry: registry,
      timestamp: Date.now(),
      deltaTime: 0,
      tokenProvider: mockTokenProvider,
      activities: { executePieceAction: mockActivity },
    };

    const node = new IntegrationAction({
      id: "test",
      provider: "google-sheets",
      action: "append_row",
      inputs: { spreadsheetId: "123" },
    });

    const status = await node.tick(context);

    expect(status).toBe(NodeStatus.SUCCESS);
    expect(mockActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google-sheets",
        action: "append_row",
        inputs: { spreadsheetId: "123" },
        auth: { access_token: "test_token_123" },
      })
    );
  });

  it("should fall back to inline execution without activity", async () => {
    // This test verifies that the node attempts inline execution when no activity is provided
    // Due to vi.mock in an earlier test, executePieceAction is mocked globally
    const context: IntegrationContext = {
      blackboard,
      treeRegistry: registry,
      timestamp: Date.now(),
      deltaTime: 0,
      tokenProvider: mockTokenProvider,
      activities: undefined, // No activities provided - should fall back to inline
    };

    const node = new IntegrationAction({
      id: "test",
      provider: "google-sheets",
      action: "append_row",
      inputs: { spreadsheetId: "123" },
    });

    // With the global mock, this will succeed via inline execution
    // The important thing is it doesn't fail with "no activity" error
    const status = await node.tick(context);

    // Succeeds because vi.mock mocks executePieceAction
    expect(status).toBe(NodeStatus.SUCCESS);
    // No error about missing activities
    expect(node.lastError).toBeUndefined();
  });

  it("should handle activity execution errors", async () => {
    const failingActivity = vi
      .fn()
      .mockRejectedValue(new Error("API timeout"));

    const context: IntegrationContext = {
      blackboard,
      treeRegistry: registry,
      timestamp: Date.now(),
      deltaTime: 0,
      tokenProvider: mockTokenProvider,
      activities: { executePieceAction: failingActivity },
    };

    const node = new IntegrationAction({
      id: "test",
      provider: "slack",
      action: "send_message",
      inputs: { channel: "#general", text: "Hello" },
    });

    const status = await node.tick(context);

    expect(status).toBe(NodeStatus.FAILURE);
    expect(node.lastError).toContain("API timeout");
  });

  it("should store activity result in blackboard", async () => {
    const mockActivity = vi.fn().mockResolvedValue({
      messageId: "msg-123",
      timestamp: "2024-01-15T10:30:00Z"
    });

    const context: IntegrationContext = {
      blackboard,
      treeRegistry: registry,
      timestamp: Date.now(),
      deltaTime: 0,
      tokenProvider: mockTokenProvider,
      activities: { executePieceAction: mockActivity },
    };

    const node = new IntegrationAction({
      id: "send-slack",
      provider: "slack",
      action: "send_message",
      inputs: { channel: "#general", text: "Hello" },
      resultKey: "slack.response",
    });

    await node.tick(context);

    expect(blackboard.get("slack.response")).toEqual({
      messageId: "msg-123",
      timestamp: "2024-01-15T10:30:00Z",
    });
  });

  it("should pass resolved inputs to activity", async () => {
    const mockActivity = vi.fn().mockResolvedValue({ success: true });

    blackboard.set("targetChannel", "#engineering");
    blackboard.set("userName", "Alice");

    const context: IntegrationContext = {
      blackboard,
      treeRegistry: registry,
      timestamp: Date.now(),
      deltaTime: 0,
      input: { messagePrefix: "Notification:" },
      tokenProvider: mockTokenProvider,
      activities: { executePieceAction: mockActivity },
    };

    const node = new IntegrationAction({
      id: "notify",
      provider: "slack",
      action: "send_message",
      inputs: {
        channel: "${bb.targetChannel}",
        text: "${input.messagePrefix} Hello ${bb.userName}!",
      },
    });

    await node.tick(context);

    expect(mockActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: {
          channel: "#engineering",
          text: "Notification: Hello Alice!",
        },
      })
    );
  });
});

describe("envTokenProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("should return access_token from environment", async () => {
    process.env.GOOGLE_SHEETS_ACCESS_TOKEN = "test_access_token";

    const auth = await envTokenProvider({} as any, "google-sheets");

    expect(auth).toEqual({ access_token: "test_access_token" });
  });

  it("should return api_key from environment", async () => {
    process.env.OPENAI_API_KEY = "sk-test-key";

    const auth = await envTokenProvider({} as any, "openai");

    expect(auth).toEqual({ api_key: "sk-test-key" });
  });

  it("should prefer access_token over api_key", async () => {
    process.env.SLACK_ACCESS_TOKEN = "xoxb-token";
    process.env.SLACK_API_KEY = "some-key";

    const auth = await envTokenProvider({} as any, "slack");

    expect(auth).toEqual({ access_token: "xoxb-token" });
  });

  it("should handle hyphens in provider name", async () => {
    process.env.GOOGLE_SHEETS_ACCESS_TOKEN = "test_token";

    const auth = await envTokenProvider({} as any, "google-sheets");

    expect(auth).toEqual({ access_token: "test_token" });
  });

  it("should throw if no token found", async () => {
    delete process.env.UNKNOWN_ACCESS_TOKEN;
    delete process.env.UNKNOWN_API_KEY;

    await expect(envTokenProvider({} as any, "unknown")).rejects.toThrow(
      /No token found/
    );
  });
});
