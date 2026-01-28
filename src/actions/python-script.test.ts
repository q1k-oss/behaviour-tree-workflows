/**
 * PythonScript Node Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScopedBlackboard } from "../blackboard.js";
import { Registry } from "../registry.js";
import { type TemporalContext, type BtreeActivities, NodeStatus } from "../types.js";
import { PythonScript, type PythonScriptConfig } from "./python-script.js";

describe("PythonScript Node", () => {
  let blackboard: ScopedBlackboard;
  let registry: Registry;

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    registry = new Registry();
    vi.clearAllMocks();
  });

  describe("Construction and validation", () => {
    it("should create node with valid config", () => {
      const node = new PythonScript({
        id: "test",
        code: "bb['result'] = 42",
      });

      expect(node).toBeDefined();
      expect(node.id).toBe("test");
    });

    it("should require code", () => {
      expect(() => {
        new PythonScript({
          id: "test",
        } as PythonScriptConfig);
      }).toThrow(/requires code/i);
    });

    it("should accept optional packages and timeout", () => {
      const node = new PythonScript({
        id: "test",
        code: "import pandas",
        packages: ["pandas"],
        timeout: 30000,
      });

      expect(node).toBeDefined();
    });
  });

  describe("Activity requirement", () => {
    it("should fail without executePythonScript activity", async () => {
      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: undefined,
      };

      const node = new PythonScript({
        id: "test",
        code: "bb['result'] = 1 + 1",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.executePythonScript");
    });

    it("should fail when activities object exists but executePythonScript is missing", async () => {
      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          // executePythonScript is not provided
        } as BtreeActivities,
      };

      const node = new PythonScript({
        id: "test",
        code: "bb['result'] = 1 + 1",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.executePythonScript");
    });
  });

  describe("Execution with activity", () => {
    it("should execute Python code via activity", async () => {
      const mockPythonActivity = vi.fn().mockResolvedValue({
        blackboard: { result: 42 },
        stdout: "",
        stderr: "",
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          executePythonScript: mockPythonActivity,
        },
      };

      const node = new PythonScript({
        id: "test",
        code: "bb['result'] = 21 * 2",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(mockPythonActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "bb['result'] = 21 * 2",
        })
      );
    });

    it("should pass blackboard state to Python", async () => {
      blackboard.set("x", 10);
      blackboard.set("y", 20);

      const mockPythonActivity = vi.fn().mockResolvedValue({
        blackboard: { sum: 30 },
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          executePythonScript: mockPythonActivity,
        },
      };

      const node = new PythonScript({
        id: "test",
        code: "bb['sum'] = bb['x'] + bb['y']",
      });

      await node.tick(context);

      expect(mockPythonActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          blackboard: { x: 10, y: 20 },
        })
      );
    });

    it("should pass workflow input to Python", async () => {
      const mockPythonActivity = vi.fn().mockResolvedValue({
        blackboard: {},
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        input: { userId: "user-123", orderId: "order-456" },
        activities: {
          executePieceAction: vi.fn(),
          executePythonScript: mockPythonActivity,
        },
      };

      const node = new PythonScript({
        id: "test",
        code: "bb['uid'] = input['userId']",
      });

      await node.tick(context);

      expect(mockPythonActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { userId: "user-123", orderId: "order-456" },
        })
      );
    });

    it("should merge Python blackboard changes back", async () => {
      blackboard.set("existing", "value");

      const mockPythonActivity = vi.fn().mockResolvedValue({
        blackboard: {
          newKey: "newValue",
          computed: 123,
        },
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          executePythonScript: mockPythonActivity,
        },
      };

      const node = new PythonScript({
        id: "test",
        code: "bb['newKey'] = 'newValue'\nbb['computed'] = 123",
      });

      await node.tick(context);

      expect(blackboard.get("newKey")).toBe("newValue");
      expect(blackboard.get("computed")).toBe(123);
      // Original value should still be there
      expect(blackboard.get("existing")).toBe("value");
    });

    it("should pass timeout to activity", async () => {
      const mockPythonActivity = vi.fn().mockResolvedValue({
        blackboard: {},
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          executePythonScript: mockPythonActivity,
        },
      };

      const node = new PythonScript({
        id: "test",
        code: "import time; time.sleep(1)",
        timeout: 5000,
      });

      await node.tick(context);

      expect(mockPythonActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });

    it("should handle activity errors", async () => {
      const mockPythonActivity = vi.fn().mockRejectedValue(
        new Error("Python execution failed: SyntaxError")
      );

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          executePythonScript: mockPythonActivity,
        },
      };

      const node = new PythonScript({
        id: "test",
        code: "this is not valid python",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("Python execution failed");
    });
  });

  describe("Variable resolution in code", () => {
    it("should resolve variables in code template", async () => {
      const mockPythonActivity = vi.fn().mockResolvedValue({
        blackboard: {},
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        input: { prefix: "result" },
        activities: {
          executePieceAction: vi.fn(),
          executePythonScript: mockPythonActivity,
        },
      };

      const node = new PythonScript({
        id: "test",
        code: "bb['${input.prefix}_data'] = 42",
      });

      await node.tick(context);

      expect(mockPythonActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "bb['result_data'] = 42",
        })
      );
    });
  });

  describe("Environment variables", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it("should pass allowed environment variables", async () => {
      process.env.MY_API_KEY = "secret-123";
      process.env.DEBUG_MODE = "true";

      const mockPythonActivity = vi.fn().mockResolvedValue({
        blackboard: {},
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          executePythonScript: mockPythonActivity,
        },
      };

      const node = new PythonScript({
        id: "test",
        code: "import os; bb['key'] = os.environ.get('MY_API_KEY')",
        allowedEnvVars: ["MY_API_KEY", "DEBUG_MODE"],
      });

      await node.tick(context);

      expect(mockPythonActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          env: {
            MY_API_KEY: "secret-123",
            DEBUG_MODE: "true",
          },
        })
      );
    });

    it("should not pass env vars that are not in allowedEnvVars", async () => {
      process.env.SECRET_KEY = "should-not-pass";

      const mockPythonActivity = vi.fn().mockResolvedValue({
        blackboard: {},
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          executePythonScript: mockPythonActivity,
        },
      };

      const node = new PythonScript({
        id: "test",
        code: "pass",
        allowedEnvVars: [], // Explicitly empty
      });

      await node.tick(context);

      expect(mockPythonActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          env: {},
        })
      );
    });
  });

  describe("Node lifecycle", () => {
    it("should clone correctly", () => {
      const node = new PythonScript({
        id: "original",
        code: "bb['x'] = 1",
        packages: ["pandas"],
        timeout: 30000,
      });

      const cloned = node.clone() as PythonScript;

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

      const node = new PythonScript({
        id: "test",
        code: "pass",
      });

      await node.tick(context);
      expect(node.status()).toBe(NodeStatus.FAILURE);

      node.reset();
      expect(node.status()).toBe(NodeStatus.IDLE);
      expect(node.lastError).toBeUndefined();
    });
  });
});
