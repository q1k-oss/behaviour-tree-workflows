/**
 * ClaudeAgent Node Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScopedBlackboard } from "../blackboard.js";
import { Registry } from "../registry.js";
import {
  type TemporalContext,
  type BtreeActivities,
  type ClaudeAgentResult,
  NodeStatus,
} from "../types.js";
import { ClaudeAgent, type ClaudeAgentConfig } from "./claude-agent.js";

describe("ClaudeAgent Node", () => {
  let blackboard: ScopedBlackboard;
  let registry: Registry;

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    registry = new Registry();
    vi.clearAllMocks();
  });

  const mockAgentResult: ClaudeAgentResult = {
    result: "I implemented the feature and created a PR.",
    sessionId: "session-abc-123",
    success: true,
    numTurns: 12,
    totalCostUsd: 0.45,
    usage: {
      inputTokens: 15000,
      outputTokens: 3000,
      cacheReadTokens: 5000,
      cacheCreationTokens: 1000,
    },
    durationMs: 45000,
  };

  describe("Construction and validation", () => {
    it("should create node with minimal config", () => {
      const node = new ClaudeAgent({
        id: "test",
        prompt: "Fix the bug in auth.ts",
        outputKey: "agentResult",
      });

      expect(node).toBeDefined();
      expect(node.id).toBe("test");
    });

    it("should require prompt", () => {
      expect(() => {
        new ClaudeAgent({
          id: "test",
          outputKey: "agentResult",
        } as ClaudeAgentConfig);
      }).toThrow(/requires prompt/i);
    });

    it("should require outputKey", () => {
      expect(() => {
        new ClaudeAgent({
          id: "test",
          prompt: "Do something",
        } as ClaudeAgentConfig);
      }).toThrow(/requires outputKey/i);
    });

    it("should accept all optional config fields", () => {
      const node = new ClaudeAgent({
        id: "test",
        prompt: "Implement feature",
        model: "claude-sonnet-4-5-20250929",
        systemPrompt: "You are a senior developer.",
        allowedTools: ["Read", "Write", "Edit", "Bash"],
        permissionMode: "acceptEdits",
        maxTurns: 100,
        maxBudgetUsd: 10.0,
        cwd: "/path/to/project",
        mcpServers: {
          playwright: {
            command: "npx",
            args: ["@playwright/mcp@latest"],
          },
        },
        agents: {
          reviewer: {
            description: "Code reviewer",
            prompt: "Review code quality",
            tools: ["Read", "Glob", "Grep"],
          },
        },
        outputKey: "agentResult",
      });

      expect(node).toBeDefined();
    });

    it("should default permissionMode to 'default'", async () => {
      const mockActivity = vi.fn().mockResolvedValue(mockAgentResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          claudeAgent: mockActivity,
        },
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "Do something",
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          permissionMode: "default",
        })
      );
    });

    it("should default maxTurns to 50", async () => {
      const mockActivity = vi.fn().mockResolvedValue(mockAgentResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          claudeAgent: mockActivity,
        },
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "Do something",
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTurns: 50,
        })
      );
    });
  });

  describe("Activity requirement", () => {
    it("should fail without claudeAgent activity", async () => {
      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: undefined,
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "Do something",
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.claudeAgent");
    });

    it("should fail when activities object exists but claudeAgent is missing", async () => {
      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
        } as BtreeActivities,
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "Do something",
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.claudeAgent");
    });
  });

  describe("Execution with activity", () => {
    it("should call activity with correct parameters", async () => {
      const mockActivity = vi.fn().mockResolvedValue(mockAgentResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          claudeAgent: mockActivity,
        },
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "Implement the Summarizer node",
        model: "claude-sonnet-4-5-20250929",
        systemPrompt: "You are a senior developer.",
        allowedTools: ["Read", "Write", "Edit", "Bash"],
        permissionMode: "acceptEdits",
        maxTurns: 100,
        maxBudgetUsd: 5.0,
        outputKey: "agentResult",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(mockActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Implement the Summarizer node",
          model: "claude-sonnet-4-5-20250929",
          systemPrompt: "You are a senior developer.",
          allowedTools: ["Read", "Write", "Edit", "Bash"],
          permissionMode: "acceptEdits",
          maxTurns: 100,
          maxBudgetUsd: 5.0,
        })
      );
    });

    it("should store result in blackboard", async () => {
      const mockActivity = vi.fn().mockResolvedValue(mockAgentResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          claudeAgent: mockActivity,
        },
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "Implement feature",
        outputKey: "myResult",
      });

      await node.tick(context);

      const stored = blackboard.get("myResult") as ClaudeAgentResult;
      expect(stored.result).toBe("I implemented the feature and created a PR.");
      expect(stored.sessionId).toBe("session-abc-123");
      expect(stored.success).toBe(true);
      expect(stored.numTurns).toBe(12);
      expect(stored.totalCostUsd).toBe(0.45);
      expect(stored.usage.inputTokens).toBe(15000);
      expect(stored.durationMs).toBe(45000);
    });

    it("should pass MCP server configs to activity", async () => {
      const mockActivity = vi.fn().mockResolvedValue(mockAgentResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          claudeAgent: mockActivity,
        },
      };

      const mcpServers = {
        playwright: {
          command: "npx",
          args: ["@playwright/mcp@latest"],
        } as const,
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "Test with MCP",
        mcpServers,
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServers,
        })
      );
    });

    it("should pass subagent definitions to activity", async () => {
      const mockActivity = vi.fn().mockResolvedValue(mockAgentResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          claudeAgent: mockActivity,
        },
      };

      const agents = {
        reviewer: {
          description: "Code reviewer",
          prompt: "Review code quality",
          tools: ["Read", "Glob", "Grep"],
        },
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "Implement and review",
        agents,
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          agents,
        })
      );
    });
  });

  describe("Variable resolution", () => {
    it("should resolve variables in prompt from blackboard", async () => {
      blackboard.set("taskDescription", "Add retry logic to HTTP client");

      const mockActivity = vi.fn().mockResolvedValue(mockAgentResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          claudeAgent: mockActivity,
        },
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "${bb.taskDescription}",
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Add retry logic to HTTP client",
        })
      );
    });

    it("should resolve variables in prompt from input", async () => {
      const mockActivity = vi.fn().mockResolvedValue(mockAgentResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        input: { task: "Fix the login bug" },
        activities: {
          executePieceAction: vi.fn(),
          claudeAgent: mockActivity,
        },
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "${input.task}",
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Fix the login bug",
        })
      );
    });

    it("should resolve variables in systemPrompt", async () => {
      blackboard.set("projectName", "btree-workflows");

      const mockActivity = vi.fn().mockResolvedValue(mockAgentResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          claudeAgent: mockActivity,
        },
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "Add tests",
        systemPrompt: "You are working on ${bb.projectName}.",
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: "You are working on btree-workflows.",
        })
      );
    });

    it("should resolve model from blackboard", async () => {
      blackboard.set("selectedModel", "claude-opus-4-20250514");

      const mockActivity = vi.fn().mockResolvedValue(mockAgentResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          claudeAgent: mockActivity,
        },
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "Do work",
        model: "${bb.selectedModel}",
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-opus-4-20250514",
        })
      );
    });

    it("should resolve cwd from blackboard", async () => {
      blackboard.set("workDir", "/home/user/project");

      const mockActivity = vi.fn().mockResolvedValue(mockAgentResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          claudeAgent: mockActivity,
        },
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "Do work",
        cwd: "${bb.workDir}",
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: "/home/user/project",
        })
      );
    });
  });

  describe("Error handling", () => {
    it("should return FAILURE and set lastError when activity throws", async () => {
      const mockActivity = vi
        .fn()
        .mockRejectedValue(new Error("API key invalid"));

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          claudeAgent: mockActivity,
        },
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "Do work",
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("API key invalid");
    });

    it("should return FAILURE when agent reports failure", async () => {
      const failedResult: ClaudeAgentResult = {
        ...mockAgentResult,
        success: false,
        errors: ["Could not find the file", "Build failed"],
      };

      const mockActivity = vi.fn().mockResolvedValue(failedResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          claudeAgent: mockActivity,
        },
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "Do work",
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("Claude agent failed");
      expect(node.lastError).toContain("Could not find the file");
      expect(node.lastError).toContain("Build failed");
    });

    it("should still store result in blackboard on agent failure for debugging", async () => {
      const failedResult: ClaudeAgentResult = {
        ...mockAgentResult,
        success: false,
        errors: ["Something went wrong"],
      };

      const mockActivity = vi.fn().mockResolvedValue(failedResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          claudeAgent: mockActivity,
        },
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "Do work",
        outputKey: "result",
      });

      await node.tick(context);

      const stored = blackboard.get("result") as ClaudeAgentResult;
      expect(stored).toBeDefined();
      expect(stored.success).toBe(false);
      expect(stored.sessionId).toBe("session-abc-123");
    });

    it("should handle failure with no errors array", async () => {
      const failedResult: ClaudeAgentResult = {
        ...mockAgentResult,
        success: false,
        errors: undefined,
      };

      const mockActivity = vi.fn().mockResolvedValue(failedResult);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          claudeAgent: mockActivity,
        },
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "Do work",
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("unknown error");
    });

    it("should handle timeout errors from activity", async () => {
      const mockActivity = vi
        .fn()
        .mockRejectedValue(new Error("Agent exceeded max budget of $5.00"));

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          claudeAgent: mockActivity,
        },
      };

      const node = new ClaudeAgent({
        id: "test",
        prompt: "Do work",
        maxBudgetUsd: 5.0,
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("exceeded max budget");
    });
  });

  describe("Node lifecycle", () => {
    it("should clone correctly", () => {
      const node = new ClaudeAgent({
        id: "original",
        prompt: "Do work",
        model: "claude-sonnet-4-5-20250929",
        systemPrompt: "Be helpful.",
        allowedTools: ["Read", "Edit"],
        outputKey: "result",
      });

      const cloned = node.clone() as ClaudeAgent;

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

      const node = new ClaudeAgent({
        id: "test",
        prompt: "Do work",
        outputKey: "result",
      });

      await node.tick(context);
      expect(node.status()).toBe(NodeStatus.FAILURE);

      node.reset();
      expect(node.status()).toBe(NodeStatus.IDLE);
      expect(node.lastError).toBeUndefined();
    });
  });

  describe("Permission modes", () => {
    const modes = ["default", "acceptEdits", "bypassPermissions"] as const;

    for (const mode of modes) {
      it(`should support ${mode} permission mode`, async () => {
        const mockActivity = vi.fn().mockResolvedValue(mockAgentResult);

        const context: TemporalContext = {
          blackboard,
          treeRegistry: registry,
          timestamp: Date.now(),
          deltaTime: 0,
          activities: {
            executePieceAction: vi.fn(),
            claudeAgent: mockActivity,
          },
        };

        const node = new ClaudeAgent({
          id: `test-${mode}`,
          prompt: "Do work",
          permissionMode: mode,
          outputKey: "result",
        });

        const status = await node.tick(context);

        expect(status).toBe(NodeStatus.SUCCESS);
        expect(mockActivity).toHaveBeenCalledWith(
          expect.objectContaining({ permissionMode: mode })
        );
      });
    }
  });
});
