/**
 * Tests for WaitForSignal Node
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type TemporalContext,
  type BtreeActivities,
  NodeStatus,
  ScopedBlackboard,
} from "../index.js";
import { WaitForSignal } from "./wait-for-signal.js";

describe("WaitForSignal", () => {
  let blackboard: ScopedBlackboard;
  let mockActivities: Partial<BtreeActivities>;
  let context: TemporalContext;

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    mockActivities = {
      waitForSignal: vi.fn(),
    };
    context = {
      blackboard,
      timestamp: Date.now(),
      deltaTime: 0,
      activities: mockActivities as BtreeActivities,
    };
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("should wait for signal and store data in blackboard", async () => {
    (mockActivities.waitForSignal as ReturnType<typeof vi.fn>).mockResolvedValue({
      received: true,
      data: { content: "Hello from user!" },
      timedOut: false,
    });

    const node = new WaitForSignal({
      id: "wfs-1",
      signalName: "user_message",
      outputKey: "userInput",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("userInput")).toEqual({ content: "Hello from user!" });

    expect(mockActivities.waitForSignal).toHaveBeenCalledWith({
      signalName: "user_message",
      signalKey: undefined,
      timeoutMs: 86400000,
    });
  });

  it("should pass signalKey to activity", async () => {
    (mockActivities.waitForSignal as ReturnType<typeof vi.fn>).mockResolvedValue({
      received: true,
      data: { message: "hi" },
      timedOut: false,
    });

    const node = new WaitForSignal({
      id: "wfs-2",
      signalName: "user_message",
      signalKey: "session-123",
      outputKey: "userInput",
    });

    await node.tick(context);

    expect(mockActivities.waitForSignal).toHaveBeenCalledWith({
      signalName: "user_message",
      signalKey: "session-123",
      timeoutMs: 86400000,
    });
  });

  it("should resolve variables in signalKey", async () => {
    (mockActivities.waitForSignal as ReturnType<typeof vi.fn>).mockResolvedValue({
      received: true,
      data: {},
      timedOut: false,
    });

    const contextWithInput: TemporalContext = {
      ...context,
      input: Object.freeze({ sessionId: "dynamic-456" }),
    };

    const node = new WaitForSignal({
      id: "wfs-3",
      signalName: "user_message",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional
      signalKey: "${input.sessionId}",
      outputKey: "userInput",
    });

    await node.tick(contextWithInput);

    expect(mockActivities.waitForSignal).toHaveBeenCalledWith({
      signalName: "user_message",
      signalKey: "dynamic-456",
      timeoutMs: 86400000,
    });
  });

  it("should return FAILURE on timeout", async () => {
    (mockActivities.waitForSignal as ReturnType<typeof vi.fn>).mockResolvedValue({
      received: false,
      timedOut: true,
    });

    const node = new WaitForSignal({
      id: "wfs-4",
      signalName: "user_message",
      timeoutMs: 5000,
      outputKey: "userInput",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.FAILURE);
    expect(node.lastError).toContain("timed out");
  });

  it("should pass custom timeoutMs", async () => {
    (mockActivities.waitForSignal as ReturnType<typeof vi.fn>).mockResolvedValue({
      received: true,
      data: {},
      timedOut: false,
    });

    const node = new WaitForSignal({
      id: "wfs-5",
      signalName: "webhook",
      timeoutMs: 60000,
      outputKey: "webhookData",
    });

    await node.tick(context);

    expect(mockActivities.waitForSignal).toHaveBeenCalledWith({
      signalName: "webhook",
      signalKey: undefined,
      timeoutMs: 60000,
    });
  });

  describe("configuration validation", () => {
    it("should throw ConfigurationError when signalName is missing", () => {
      expect(() => new WaitForSignal({
        id: "bad",
        signalName: "",
        outputKey: "out",
      })).toThrow("WaitForSignal requires signalName");
    });

    it("should throw ConfigurationError when outputKey is missing", () => {
      expect(() => new WaitForSignal({
        id: "bad",
        signalName: "test",
        outputKey: "",
      })).toThrow("WaitForSignal requires outputKey");
    });
  });

  it("should return FAILURE when activity throws an exception", async () => {
    (mockActivities.waitForSignal as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Temporal workflow cancelled")
    );

    const node = new WaitForSignal({
      id: "wfs-crash",
      signalName: "event",
      outputKey: "data",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.FAILURE);
    expect(node.lastError).toBe("Temporal workflow cancelled");
  });

  it("should not overwrite blackboard on timeout", async () => {
    blackboard.set("userInput", { existing: "data" });

    (mockActivities.waitForSignal as ReturnType<typeof vi.fn>).mockResolvedValue({
      received: false,
      timedOut: true,
    });

    const node = new WaitForSignal({
      id: "wfs-timeout-preserve",
      signalName: "user_message",
      timeoutMs: 1000,
      outputKey: "userInput",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.FAILURE);
    // Previous data should still be there (not overwritten)
    expect(blackboard.get("userInput")).toEqual({ existing: "data" });
  });

  it("should use 24h default timeout when timeoutMs is not set", () => {
    const node = new WaitForSignal({
      id: "wfs-default-timeout",
      signalName: "test",
      outputKey: "data",
    });

    // Access the private field through any cast to verify default
    expect((node as any).timeoutMs).toBe(86400000);
  });

  it("should fail when waitForSignal activity is missing", async () => {
    const noActivityContext: TemporalContext = {
      blackboard,
      timestamp: Date.now(),
      deltaTime: 0,
      activities: {} as BtreeActivities,
    };

    const node = new WaitForSignal({
      id: "wfs-6",
      signalName: "event",
      outputKey: "data",
    });

    const result = await node.tick(noActivityContext);

    expect(result).toBe(NodeStatus.FAILURE);
  });
});
