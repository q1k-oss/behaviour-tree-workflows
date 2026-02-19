/**
 * Tests for StreamingSink Decorator
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type TemporalContext,
  NodeStatus,
  ScopedBlackboard,
} from "../index.js";
import { StreamingSink } from "./streaming-sink.js";
import { MockAction } from "../test-nodes.js";

describe("StreamingSink", () => {
  let blackboard: ScopedBlackboard;
  let context: TemporalContext;

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    context = {
      blackboard,
      timestamp: Date.now(),
      deltaTime: 0,
    };
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("should set __streamChannelId before child tick", async () => {
    let channelDuringTick: unknown;

    // Create a mock child that captures the channel ID during tick
    const child = new MockAction({ id: "child", returnStatus: NodeStatus.SUCCESS });
    const origTick = child.tick.bind(child);
    child.tick = async (ctx: TemporalContext) => {
      channelDuringTick = ctx.blackboard.get("__streamChannelId");
      return origTick(ctx);
    };

    const node = new StreamingSink({
      id: "ss-1",
      channelId: "ws-channel-123",
    });
    (node as any).child = child;

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(channelDuringTick).toBe("ws-channel-123");
  });

  it("should restore previous value after child tick", async () => {
    blackboard.set("__streamChannelId", "previous-channel");

    const child = new MockAction({ id: "child", returnStatus: NodeStatus.SUCCESS });

    const node = new StreamingSink({
      id: "ss-2",
      channelId: "new-channel",
    });
    (node as any).child = child;

    await node.tick(context);

    // Should be restored to previous value
    expect(blackboard.get("__streamChannelId")).toBe("previous-channel");
  });

  it("should delete __streamChannelId if it didn't exist before", async () => {
    // No previous value set
    const child = new MockAction({ id: "child", returnStatus: NodeStatus.SUCCESS });

    const node = new StreamingSink({
      id: "ss-3",
      channelId: "temp-channel",
    });
    (node as any).child = child;

    await node.tick(context);

    expect(blackboard.has("__streamChannelId")).toBe(false);
  });

  it("should restore value even if child fails", async () => {
    blackboard.set("__streamChannelId", "outer-channel");

    const child = new MockAction({ id: "child", returnStatus: NodeStatus.FAILURE });

    const node = new StreamingSink({
      id: "ss-4",
      channelId: "inner-channel",
    });
    (node as any).child = child;

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.FAILURE);
    expect(blackboard.get("__streamChannelId")).toBe("outer-channel");
  });

  it("should read channel ID from channelKey on blackboard", async () => {
    blackboard.set("myChannel", "dynamic-channel-456");

    let channelDuringTick: unknown;
    const child = new MockAction({ id: "child", returnStatus: NodeStatus.SUCCESS });
    const origTick = child.tick.bind(child);
    child.tick = async (ctx: TemporalContext) => {
      channelDuringTick = ctx.blackboard.get("__streamChannelId");
      return origTick(ctx);
    };

    const node = new StreamingSink({
      id: "ss-5",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional
      channelKey: "${bb.myChannel}",
    });
    (node as any).child = child;

    await node.tick(context);

    expect(channelDuringTick).toBe("dynamic-channel-456");
  });

  describe("configuration validation", () => {
    it("should throw ConfigurationError when neither channelId nor channelKey is provided", () => {
      expect(() => new StreamingSink({
        id: "bad",
      })).toThrow("StreamingSink requires either channelId or channelKey");
    });

    it("should throw ConfigurationError when child is missing", async () => {
      const node = new StreamingSink({
        id: "ss-no-child",
        channelId: "test",
      });
      // No child set

      await expect(node.tick(context)).rejects.toThrow("Decorator must have a child");
    });
  });

  it("should handle nested StreamingSink (inner overrides, outer restores)", async () => {
    let innerChannelDuringTick: unknown;

    // Inner child captures the channel
    const innerChild = new MockAction({ id: "inner-child", returnStatus: NodeStatus.SUCCESS });
    const origTick = innerChild.tick.bind(innerChild);
    innerChild.tick = async (ctx: TemporalContext) => {
      innerChannelDuringTick = ctx.blackboard.get("__streamChannelId");
      return origTick(ctx);
    };

    // Inner StreamingSink
    const innerSink = new StreamingSink({
      id: "inner-sink",
      channelId: "inner-channel",
    });
    (innerSink as any).child = innerChild;

    // Outer StreamingSink wraps the inner
    const outerSink = new StreamingSink({
      id: "outer-sink",
      channelId: "outer-channel",
    });
    (outerSink as any).child = innerSink;

    const result = await outerSink.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    // Inner child should have seen inner channel
    expect(innerChannelDuringTick).toBe("inner-channel");
    // After both complete, __streamChannelId should be cleaned up (no previous value)
    expect(blackboard.has("__streamChannelId")).toBe(false);
  });

  it("should restore on child exception", async () => {
    blackboard.set("__streamChannelId", "original");

    const child = new MockAction({ id: "child", returnStatus: NodeStatus.SUCCESS });
    child.tick = async () => {
      throw new Error("child crashed");
    };

    const node = new StreamingSink({
      id: "ss-throw",
      channelId: "temp",
    });
    (node as any).child = child;

    // Base DecoratorNode.tick() catches exceptions and returns FAILURE
    const result = await node.tick(context);
    expect(result).toBe(NodeStatus.FAILURE);
    // The finally block in executeTick should still have restored the value
    expect(blackboard.get("__streamChannelId")).toBe("original");
  });

  it("should propagate child status", async () => {
    const child = new MockAction({ id: "child", returnStatus: NodeStatus.RUNNING });

    const node = new StreamingSink({
      id: "ss-6",
      channelId: "channel",
    });
    (node as any).child = child;

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.RUNNING);
  });
});
