/**
 * GitHubAction Node Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScopedBlackboard } from "../blackboard.js";
import { Registry } from "../registry.js";
import {
  type TemporalContext,
  type GitHubActionResult,
  NodeStatus,
} from "../types.js";
import { GitHubAction, type GitHubActionConfig } from "./github-action.js";

describe("GitHubAction Node", () => {
  let blackboard: ScopedBlackboard;
  let registry: Registry;

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    registry = new Registry();
    vi.clearAllMocks();
  });

  const mockPrResult: GitHubActionResult = {
    success: true,
    data: { number: 42, url: "https://api.github.com/repos/owner/repo/pulls/42", htmlUrl: "https://github.com/owner/repo/pull/42" },
    operation: "createPullRequest",
  };

  function makeContext(activity?: ReturnType<typeof vi.fn>): TemporalContext {
    return {
      blackboard,
      treeRegistry: registry,
      timestamp: Date.now(),
      deltaTime: 0,
      activities: activity
        ? { executePieceAction: vi.fn(), githubAction: activity }
        : undefined,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Construction and validation
  // ─────────────────────────────────────────────────────────────────────────

  describe("Construction and validation", () => {
    it("should create node with minimal config", () => {
      const node = new GitHubAction({
        id: "test",
        operation: "createPullRequest",
        repo: "owner/repo",
        outputKey: "prResult",
      });

      expect(node).toBeDefined();
      expect(node.id).toBe("test");
    });

    it("should require operation", () => {
      expect(() => {
        new GitHubAction({
          id: "test",
          repo: "owner/repo",
          outputKey: "result",
        } as GitHubActionConfig);
      }).toThrow(/requires operation/i);
    });

    it("should reject invalid operation", () => {
      expect(() => {
        new GitHubAction({
          id: "test",
          operation: "invalidOp" as any,
          repo: "owner/repo",
          outputKey: "result",
        });
      }).toThrow(/invalid operation/i);
    });

    it("should require repo", () => {
      expect(() => {
        new GitHubAction({
          id: "test",
          operation: "createPullRequest",
          outputKey: "result",
        } as GitHubActionConfig);
      }).toThrow(/requires repo/i);
    });

    it("should require outputKey", () => {
      expect(() => {
        new GitHubAction({
          id: "test",
          operation: "createPullRequest",
          repo: "owner/repo",
        } as GitHubActionConfig);
      }).toThrow(/requires outputKey/i);
    });

    it("should accept all valid operations", () => {
      const operations = [
        "createBranch",
        "createPullRequest",
        "getPullRequest",
        "mergePullRequest",
        "closePullRequest",
        "createReview",
        "listIssues",
        "addLabels",
        "createComment",
        "createRelease",
      ] as const;

      for (const operation of operations) {
        const node = new GitHubAction({
          id: `test-${operation}`,
          operation,
          repo: "owner/repo",
          outputKey: "result",
        });
        expect(node).toBeDefined();
      }
    });

    it("should default params to empty object", async () => {
      const mockActivity = vi.fn().mockResolvedValue(mockPrResult);
      const context = makeContext(mockActivity);

      const node = new GitHubAction({
        id: "test",
        operation: "listIssues",
        repo: "owner/repo",
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          params: {},
        })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Activity requirement
  // ─────────────────────────────────────────────────────────────────────────

  describe("Activity requirement", () => {
    it("should fail without githubAction activity", async () => {
      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: undefined,
      };

      const node = new GitHubAction({
        id: "test",
        operation: "createPullRequest",
        repo: "owner/repo",
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.githubAction");
    });

    it("should fail when activities exist but githubAction is missing", async () => {
      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
        },
      };

      const node = new GitHubAction({
        id: "test",
        operation: "createPullRequest",
        repo: "owner/repo",
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.githubAction");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Operation execution
  // ─────────────────────────────────────────────────────────────────────────

  describe("Operation execution", () => {
    it("should execute createPullRequest and store result", async () => {
      const mockActivity = vi.fn().mockResolvedValue(mockPrResult);
      const context = makeContext(mockActivity);

      const node = new GitHubAction({
        id: "test",
        operation: "createPullRequest",
        repo: "owner/repo",
        params: {
          title: "feat: new feature",
          body: "Description",
          head: "feat/branch",
          base: "main",
        },
        outputKey: "prResult",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(mockActivity).toHaveBeenCalledWith({
        operation: "createPullRequest",
        repo: "owner/repo",
        params: {
          title: "feat: new feature",
          body: "Description",
          head: "feat/branch",
          base: "main",
        },
      });
      // Stores result.data (not full result)
      expect(blackboard.get("prResult")).toEqual(mockPrResult.data);
    });

    it("should execute createBranch", async () => {
      const branchResult: GitHubActionResult = {
        success: true,
        data: { branch: "feat/new", sha: "abc123" },
        operation: "createBranch",
      };
      const mockActivity = vi.fn().mockResolvedValue(branchResult);
      const context = makeContext(mockActivity);

      const node = new GitHubAction({
        id: "test",
        operation: "createBranch",
        repo: "owner/repo",
        params: { branch: "feat/new", from: "main" },
        outputKey: "branchResult",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(mockActivity).toHaveBeenCalledWith({
        operation: "createBranch",
        repo: "owner/repo",
        params: { branch: "feat/new", from: "main" },
      });
      expect(blackboard.get("branchResult")).toEqual({ branch: "feat/new", sha: "abc123" });
    });

    it("should execute mergePullRequest", async () => {
      const mergeResult: GitHubActionResult = {
        success: true,
        data: { merged: true, sha: "def456", message: "Merged" },
        operation: "mergePullRequest",
      };
      const mockActivity = vi.fn().mockResolvedValue(mergeResult);
      const context = makeContext(mockActivity);

      const node = new GitHubAction({
        id: "test",
        operation: "mergePullRequest",
        repo: "owner/repo",
        params: { pullNumber: 42, mergeMethod: "squash" },
        outputKey: "mergeResult",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(mockActivity).toHaveBeenCalledWith({
        operation: "mergePullRequest",
        repo: "owner/repo",
        params: { pullNumber: 42, mergeMethod: "squash" },
      });
      expect(blackboard.get("mergeResult")).toEqual({ merged: true, sha: "def456", message: "Merged" });
    });

    it("should execute addLabels", async () => {
      const labelResult: GitHubActionResult = {
        success: true,
        data: { labels: ["bug", "priority-high"] },
        operation: "addLabels",
      };
      const mockActivity = vi.fn().mockResolvedValue(labelResult);
      const context = makeContext(mockActivity);

      const node = new GitHubAction({
        id: "test",
        operation: "addLabels",
        repo: "owner/repo",
        params: { issueNumber: 10, labels: ["bug", "priority-high"] },
        outputKey: "labelResult",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("labelResult")).toEqual({ labels: ["bug", "priority-high"] });
    });

    it("should execute createRelease", async () => {
      const releaseResult: GitHubActionResult = {
        success: true,
        data: { id: 1, url: "https://api.github.com/repos/owner/repo/releases/1", htmlUrl: "https://github.com/owner/repo/releases/tag/v1.0.0", tagName: "v1.0.0" },
        operation: "createRelease",
      };
      const mockActivity = vi.fn().mockResolvedValue(releaseResult);
      const context = makeContext(mockActivity);

      const node = new GitHubAction({
        id: "test",
        operation: "createRelease",
        repo: "owner/repo",
        params: { tag: "v1.0.0", name: "v1.0.0", body: "Release notes" },
        outputKey: "releaseResult",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("releaseResult")).toEqual(releaseResult.data);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Variable resolution
  // ─────────────────────────────────────────────────────────────────────────

  describe("Variable resolution", () => {
    it("should resolve repo from input", async () => {
      const mockActivity = vi.fn().mockResolvedValue(mockPrResult);
      const context = makeContext(mockActivity);
      context.input = { repo: "my-org/my-repo" };

      const node = new GitHubAction({
        id: "test",
        operation: "createPullRequest",
        repo: "${input.repo}",
        params: { title: "Test", head: "feat/test", base: "main" },
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          repo: "my-org/my-repo",
        })
      );
    });

    it("should resolve string params from blackboard", async () => {
      const mockActivity = vi.fn().mockResolvedValue(mockPrResult);
      const context = makeContext(mockActivity);
      blackboard.set("branchName", "feat/awesome");
      blackboard.set("prTitle", "feat: awesome feature");

      const node = new GitHubAction({
        id: "test",
        operation: "createPullRequest",
        repo: "owner/repo",
        params: {
          title: "${bb.prTitle}",
          head: "${bb.branchName}",
          base: "main",
        },
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          params: {
            title: "feat: awesome feature",
            head: "feat/awesome",
            base: "main",
          },
        })
      );
    });

    it("should not resolve non-string param values", async () => {
      const mockActivity = vi.fn().mockResolvedValue({
        success: true,
        data: { merged: true },
        operation: "mergePullRequest",
      });
      const context = makeContext(mockActivity);

      const node = new GitHubAction({
        id: "test",
        operation: "mergePullRequest",
        repo: "owner/repo",
        params: {
          pullNumber: 42,
          draft: false,
        },
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          params: {
            pullNumber: 42,
            draft: false,
          },
        })
      );
    });

    it("should resolve params from input", async () => {
      const mockActivity = vi.fn().mockResolvedValue({
        success: true,
        data: { number: 5, state: "closed" },
        operation: "closePullRequest",
      });
      const context = makeContext(mockActivity);
      context.input = { prNumber: 5 };

      const node = new GitHubAction({
        id: "test",
        operation: "closePullRequest",
        repo: "owner/repo",
        params: {
          pullNumber: "${input.prNumber}",
        },
        outputKey: "result",
      });

      await node.tick(context);

      expect(mockActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          params: {
            pullNumber: 5,
          },
        })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Error handling
  // ─────────────────────────────────────────────────────────────────────────

  describe("Error handling", () => {
    it("should return FAILURE when activity throws", async () => {
      const mockActivity = vi.fn().mockRejectedValue(new Error("GitHub API rate limited"));
      const context = makeContext(mockActivity);

      const node = new GitHubAction({
        id: "test",
        operation: "createPullRequest",
        repo: "owner/repo",
        params: { title: "Test", head: "feat/test", base: "main" },
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("GitHub API rate limited");
    });

    it("should return FAILURE when result.success is false", async () => {
      const failResult: GitHubActionResult = {
        success: false,
        data: null,
        operation: "mergePullRequest",
      };
      const mockActivity = vi.fn().mockResolvedValue(failResult);
      const context = makeContext(mockActivity);

      const node = new GitHubAction({
        id: "test",
        operation: "mergePullRequest",
        repo: "owner/repo",
        params: { pullNumber: 42 },
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("mergePullRequest failed");
    });

    it("should still store result data on failure", async () => {
      const failResult: GitHubActionResult = {
        success: false,
        data: { error: "Branch protection rule violated" },
        operation: "mergePullRequest",
      };
      const mockActivity = vi.fn().mockResolvedValue(failResult);
      const context = makeContext(mockActivity);

      const node = new GitHubAction({
        id: "test",
        operation: "mergePullRequest",
        repo: "owner/repo",
        params: { pullNumber: 42 },
        outputKey: "result",
      });

      await node.tick(context);

      // Data is still stored even on failure — useful for error inspection
      expect(blackboard.get("result")).toEqual({ error: "Branch protection rule violated" });
    });

    it("should handle non-Error thrown values", async () => {
      const mockActivity = vi.fn().mockRejectedValue("network timeout");
      const context = makeContext(mockActivity);

      const node = new GitHubAction({
        id: "test",
        operation: "createBranch",
        repo: "owner/repo",
        params: { branch: "feat/new", from: "main" },
        outputKey: "result",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("network timeout");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  describe("Lifecycle", () => {
    it("should be cloneable", () => {
      const node = new GitHubAction({
        id: "test",
        operation: "createPullRequest",
        repo: "owner/repo",
        params: { title: "PR", head: "feat/x", base: "main" },
        outputKey: "result",
      });

      const clone = node.clone();
      expect(clone).toBeDefined();
      expect(clone.id).toBe("test");
    });

    it("should reset properly", async () => {
      const mockActivity = vi.fn().mockResolvedValue(mockPrResult);
      const context = makeContext(mockActivity);

      const node = new GitHubAction({
        id: "test",
        operation: "createPullRequest",
        repo: "owner/repo",
        params: { title: "PR", head: "feat/x", base: "main" },
        outputKey: "result",
      });

      // First tick
      const status1 = await node.tick(context);
      expect(status1).toBe(NodeStatus.SUCCESS);

      // Reset
      node.reset();

      // Second tick
      const status2 = await node.tick(context);
      expect(status2).toBe(NodeStatus.SUCCESS);
      expect(mockActivity).toHaveBeenCalledTimes(2);
    });
  });
});
