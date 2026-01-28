/**
 * HttpRequest Node Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScopedBlackboard } from "../blackboard.js";
import { Registry } from "../registry.js";
import { type TemporalContext, type BtreeActivities, NodeStatus } from "../types.js";
import { HttpRequest, type HttpRequestConfig } from "./http-request.js";

describe("HttpRequest Node", () => {
  let blackboard: ScopedBlackboard;
  let registry: Registry;

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    registry = new Registry();
    vi.clearAllMocks();
  });

  describe("Construction and validation", () => {
    it("should create node with valid config", () => {
      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/data",
        outputKey: "response",
      });

      expect(node).toBeDefined();
      expect(node.id).toBe("test");
    });

    it("should require url", () => {
      expect(() => {
        new HttpRequest({
          id: "test",
          outputKey: "response",
        } as HttpRequestConfig);
      }).toThrow(/requires url/i);
    });

    it("should require outputKey", () => {
      expect(() => {
        new HttpRequest({
          id: "test",
          url: "https://api.example.com/data",
        } as HttpRequestConfig);
      }).toThrow(/requires outputKey/i);
    });

    it("should accept optional method, headers, body, timeout, and retry", () => {
      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/data",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { key: "value" },
        timeout: 5000,
        retry: { maxAttempts: 3, backoffMs: 1000 },
        outputKey: "response",
      });

      expect(node).toBeDefined();
    });

    it("should default method to GET", () => {
      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/data",
        outputKey: "response",
      });

      expect(node).toBeDefined();
    });
  });

  describe("Activity requirement", () => {
    it("should fail without fetchUrl activity", async () => {
      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: undefined,
      };

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/data",
        outputKey: "response",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.fetchUrl");
    });

    it("should fail when activities object exists but fetchUrl is missing", async () => {
      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          // fetchUrl is not provided
        } as BtreeActivities,
      };

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/data",
        outputKey: "response",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.fetchUrl");
    });
  });

  describe("Execution with activity", () => {
    it("should make GET request via activity", async () => {
      const mockFetchActivity = vi.fn().mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/json" },
        data: { id: 1, name: "Test" },
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          fetchUrl: mockFetchActivity,
        },
      };

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/users/1",
        method: "GET",
        outputKey: "userData",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(mockFetchActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://api.example.com/users/1",
          method: "GET",
        })
      );
    });

    it("should make POST request with body", async () => {
      const mockFetchActivity = vi.fn().mockResolvedValue({
        status: 201,
        headers: { "content-type": "application/json" },
        data: { id: 123, success: true },
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          fetchUrl: mockFetchActivity,
        },
      };

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/orders",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { product: "Widget", quantity: 5 },
        outputKey: "orderResponse",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(mockFetchActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://api.example.com/orders",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: { product: "Widget", quantity: 5 },
        })
      );
    });

    it("should store response in blackboard", async () => {
      const responseData = { users: [{ id: 1 }, { id: 2 }] };
      const mockFetchActivity = vi.fn().mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/json" },
        data: responseData,
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          fetchUrl: mockFetchActivity,
        },
      };

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/users",
        outputKey: "apiResponse",
      });

      await node.tick(context);

      const stored = blackboard.get("apiResponse") as {
        status: number;
        headers: Record<string, string>;
        data: unknown;
      };
      expect(stored.status).toBe(200);
      expect(stored.headers).toEqual({ "content-type": "application/json" });
      expect(stored.data).toEqual(responseData);
    });

    it("should resolve URL from input", async () => {
      const mockFetchActivity = vi.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: {},
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        input: { userId: "abc123" },
        activities: {
          executePieceAction: vi.fn(),
          fetchUrl: mockFetchActivity,
        },
      };

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/users/${input.userId}",
        outputKey: "response",
      });

      await node.tick(context);

      expect(mockFetchActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://api.example.com/users/abc123",
        })
      );
    });

    it("should resolve URL from blackboard", async () => {
      blackboard.set("apiEndpoint", "https://custom-api.example.com");

      const mockFetchActivity = vi.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: {},
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          fetchUrl: mockFetchActivity,
        },
      };

      const node = new HttpRequest({
        id: "test",
        url: "${bb.apiEndpoint}/data",
        outputKey: "response",
      });

      await node.tick(context);

      expect(mockFetchActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://custom-api.example.com/data",
        })
      );
    });

    it("should resolve headers from blackboard", async () => {
      blackboard.set("accessToken", "secret-token-123");

      const mockFetchActivity = vi.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: {},
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          fetchUrl: mockFetchActivity,
        },
      };

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/protected",
        headers: {
          Authorization: "Bearer ${bb.accessToken}",
        },
        outputKey: "response",
      });

      await node.tick(context);

      expect(mockFetchActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            Authorization: "Bearer secret-token-123",
          },
        })
      );
    });

    it("should resolve body from blackboard and input", async () => {
      blackboard.set("cartItems", [{ productId: 1 }, { productId: 2 }]);

      const mockFetchActivity = vi.fn().mockResolvedValue({
        status: 201,
        headers: {},
        data: { orderId: "ORD-001" },
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        input: { customerId: "CUST-123" },
        activities: {
          executePieceAction: vi.fn(),
          fetchUrl: mockFetchActivity,
        },
      };

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/orders",
        method: "POST",
        body: {
          customerId: "${input.customerId}",
          items: "${bb.cartItems}",
        },
        outputKey: "response",
      });

      await node.tick(context);

      expect(mockFetchActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            customerId: "CUST-123",
            items: [{ productId: 1 }, { productId: 2 }],
          },
        })
      );
    });

    it("should pass timeout to activity", async () => {
      const mockFetchActivity = vi.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: {},
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          fetchUrl: mockFetchActivity,
        },
      };

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/data",
        timeout: 5000,
        outputKey: "response",
      });

      await node.tick(context);

      expect(mockFetchActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });

    it("should parse JSON string response when responseType is json", async () => {
      const mockFetchActivity = vi.fn().mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/json" },
        data: '{"key": "value"}',
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          fetchUrl: mockFetchActivity,
        },
      };

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/data",
        responseType: "json",
        outputKey: "response",
      });

      await node.tick(context);

      const stored = blackboard.get("response") as { data: unknown };
      expect(stored.data).toEqual({ key: "value" });
    });

    it("should keep text response as-is when responseType is text", async () => {
      const mockFetchActivity = vi.fn().mockResolvedValue({
        status: 200,
        headers: { "content-type": "text/plain" },
        data: "Plain text response",
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          fetchUrl: mockFetchActivity,
        },
      };

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/data",
        responseType: "text",
        outputKey: "response",
      });

      await node.tick(context);

      const stored = blackboard.get("response") as { data: unknown };
      expect(stored.data).toBe("Plain text response");
    });

    it("should handle activity errors", async () => {
      const mockFetchActivity = vi.fn().mockRejectedValue(
        new Error("Network error: Connection refused")
      );

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          fetchUrl: mockFetchActivity,
        },
      };

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/data",
        outputKey: "response",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("Network error");
    });

    it("should return FAILURE for 4xx status codes", async () => {
      const mockFetchActivity = vi.fn().mockResolvedValue({
        status: 404,
        headers: {},
        data: { error: "Not found" },
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          fetchUrl: mockFetchActivity,
        },
      };

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/missing",
        outputKey: "response",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      // Response should still be stored
      const stored = blackboard.get("response") as { status: number };
      expect(stored.status).toBe(404);
    });

    it("should return FAILURE for 5xx status codes", async () => {
      const mockFetchActivity = vi.fn().mockResolvedValue({
        status: 500,
        headers: {},
        data: { error: "Internal server error" },
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          fetchUrl: mockFetchActivity,
        },
      };

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/error",
        outputKey: "response",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
    });

    it("should return SUCCESS for 2xx status codes", async () => {
      for (const statusCode of [200, 201, 204]) {
        const mockFetchActivity = vi.fn().mockResolvedValue({
          status: statusCode,
          headers: {},
          data: {},
        });

        const context: TemporalContext = {
          blackboard,
          treeRegistry: registry,
          timestamp: Date.now(),
          deltaTime: 0,
          activities: {
            executePieceAction: vi.fn(),
            fetchUrl: mockFetchActivity,
          },
        };

        const node = new HttpRequest({
          id: `test-${statusCode}`,
          url: "https://api.example.com/data",
          outputKey: `response-${statusCode}`,
        });

        const status = await node.tick(context);
        expect(status).toBe(NodeStatus.SUCCESS);
      }
    });
  });

  describe("Retry functionality", () => {
    it("should retry on failure up to maxAttempts", async () => {
      const mockFetchActivity = vi
        .fn()
        .mockRejectedValueOnce(new Error("Temporary failure 1"))
        .mockRejectedValueOnce(new Error("Temporary failure 2"))
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: { success: true },
        });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          fetchUrl: mockFetchActivity,
        },
      };

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/flaky",
        retry: {
          maxAttempts: 3,
          backoffMs: 10, // Use small backoff for testing
        },
        outputKey: "response",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(mockFetchActivity).toHaveBeenCalledTimes(3);
    });

    it("should fail after exhausting all retry attempts", async () => {
      const mockFetchActivity = vi.fn().mockRejectedValue(
        new Error("Persistent failure")
      );

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          fetchUrl: mockFetchActivity,
        },
      };

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/broken",
        retry: {
          maxAttempts: 3,
          backoffMs: 10,
        },
        outputKey: "response",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(mockFetchActivity).toHaveBeenCalledTimes(3);
      expect(node.lastError).toContain("Persistent failure");
    });

    it("should not retry when retry config is not provided", async () => {
      const mockFetchActivity = vi.fn().mockRejectedValue(
        new Error("Single failure")
      );

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          fetchUrl: mockFetchActivity,
        },
      };

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/data",
        outputKey: "response",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(mockFetchActivity).toHaveBeenCalledTimes(1);
    });
  });

  describe("Node lifecycle", () => {
    it("should clone correctly", () => {
      const node = new HttpRequest({
        id: "original",
        url: "https://api.example.com/data",
        method: "POST",
        headers: { "X-Custom": "header" },
        outputKey: "response",
      });

      const cloned = node.clone() as HttpRequest;

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

      const node = new HttpRequest({
        id: "test",
        url: "https://api.example.com/data",
        outputKey: "response",
      });

      await node.tick(context);
      expect(node.status()).toBe(NodeStatus.FAILURE);

      node.reset();
      expect(node.status()).toBe(NodeStatus.IDLE);
      expect(node.lastError).toBeUndefined();
    });
  });

  describe("HTTP methods", () => {
    const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

    for (const method of methods) {
      it(`should support ${method} method`, async () => {
        const mockFetchActivity = vi.fn().mockResolvedValue({
          status: 200,
          headers: {},
          data: {},
        });

        const context: TemporalContext = {
          blackboard,
          treeRegistry: registry,
          timestamp: Date.now(),
          deltaTime: 0,
          activities: {
            executePieceAction: vi.fn(),
            fetchUrl: mockFetchActivity,
          },
        };

        const node = new HttpRequest({
          id: `test-${method}`,
          url: "https://api.example.com/data",
          method,
          outputKey: "response",
        });

        await node.tick(context);

        expect(mockFetchActivity).toHaveBeenCalledWith(
          expect.objectContaining({ method })
        );
      });
    }
  });
});
