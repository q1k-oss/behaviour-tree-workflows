import { beforeEach, describe, expect, it } from "vitest";
import { ActionNode } from "../base-node.js";
import { ScopedBlackboard } from "../blackboard.js";
import { ConfigurationError } from "../errors.js";
import { MockAction, SuccessNode } from "../test-nodes.js";
import { type TemporalContext, NodeStatus } from "../types.js";
import { checkSignal } from "../utils/signal-check.js";
import { ForEach } from "./for-each.js";
import { Fallback, Selector } from "./selector.js";

describe("Selector", () => {
  let context: TemporalContext;
  let selector: Selector;

  beforeEach(() => {
    context = {
      blackboard: new ScopedBlackboard(),
      timestamp: Date.now(),
      deltaTime: 0,
    };
    selector = new Selector({ id: "test-selector" });
  });

  it("should return FAILURE when empty", async () => {
    const status = await selector.tick(context);
    expect(status).toBe(NodeStatus.FAILURE);
  });

  it("should return SUCCESS on first successful child", async () => {
    const executionOrder: string[] = [];

    const child1 = new MockAction({
      id: "child1",
      returnStatus: NodeStatus.FAILURE,
    });
    const child2 = new MockAction({
      id: "child2",
      returnStatus: NodeStatus.SUCCESS,
    });
    const child3 = new MockAction({
      id: "child3",
      returnStatus: NodeStatus.SUCCESS,
    });

    // Track execution order
    const originalTick1 = child1.tick.bind(child1);
    const originalTick2 = child2.tick.bind(child2);
    const originalTick3 = child3.tick.bind(child3);

    child1.tick = (ctx) => {
      executionOrder.push("child1");
      return originalTick1(ctx);
    };
    child2.tick = (ctx) => {
      executionOrder.push("child2");
      return originalTick2(ctx);
    };
    child3.tick = (ctx) => {
      executionOrder.push("child3");
      return originalTick3(ctx);
    };

    selector.addChildren([child1, child2, child3]);

    const status = await selector.tick(context);

    expect(status).toBe(NodeStatus.SUCCESS);
    expect(executionOrder).toEqual(["child1", "child2"]); // child3 should not execute
    expect(selector.status()).toBe(NodeStatus.SUCCESS);
  });

  it("should return FAILURE when all children fail", async () => {
    const child1 = new MockAction({
      id: "child1",
      returnStatus: NodeStatus.FAILURE,
    });
    const child2 = new MockAction({
      id: "child2",
      returnStatus: NodeStatus.FAILURE,
    });
    const child3 = new MockAction({
      id: "child3",
      returnStatus: NodeStatus.FAILURE,
    });

    selector.addChildren([child1, child2, child3]);

    const status = await selector.tick(context);

    expect(status).toBe(NodeStatus.FAILURE);
    expect(selector.status()).toBe(NodeStatus.FAILURE);
  });

  it("should handle RUNNING status correctly", async () => {
    const child1 = new MockAction({
      id: "child1",
      returnStatus: NodeStatus.FAILURE,
    });
    let child2 = new MockAction({
      id: "child2",
      returnStatus: NodeStatus.RUNNING,
      ticksBeforeComplete: 2,
    });
    const child3 = new MockAction({
      id: "child3",
      returnStatus: NodeStatus.SUCCESS,
    });

    selector.addChildren([child1, child2, child3]);

    // First tick - child2 returns RUNNING
    let status = await selector.tick(context);
    expect(status).toBe(NodeStatus.RUNNING);
    expect(child1.status()).toBe(NodeStatus.FAILURE);
    expect(child2.status()).toBe(NodeStatus.RUNNING);

    // Second tick - child2 still RUNNING
    status = await selector.tick(context);
    expect(status).toBe(NodeStatus.RUNNING);

    // Replace child2 to simulate completion
    child2 = new MockAction({
      id: "child2",
      returnStatus: NodeStatus.SUCCESS,
    });
    selector._children[1] = child2;

    status = await selector.tick(context);
    expect(status).toBe(NodeStatus.SUCCESS);
    expect(child3.status()).toBe(NodeStatus.IDLE); // Should not have been executed
  });

  it("should continue after RUNNING child fails", async () => {
    let tickCount = 0;
    const child1 = new MockAction({
      id: "child1",
      returnStatus: NodeStatus.FAILURE,
    });

    // Custom child that returns RUNNING first, then FAILURE
    const child2 = new MockAction({ id: "child2" });
    child2.tick = async (_ctx) => {
      tickCount++;
      if (tickCount === 1) {
        (child2 as unknown)._status = NodeStatus.RUNNING;
        return NodeStatus.RUNNING;
      }
      (child2 as unknown)._status = NodeStatus.FAILURE;
      return NodeStatus.FAILURE;
    };

    const child3 = new MockAction({
      id: "child3",
      returnStatus: NodeStatus.SUCCESS,
    });

    selector.addChildren([child1, child2, child3]);

    // First tick - child2 returns RUNNING
    let status = await selector.tick(context);
    expect(status).toBe(NodeStatus.RUNNING);

    // Second tick - child2 fails, moves to child3
    status = await selector.tick(context);
    expect(status).toBe(NodeStatus.SUCCESS);
    expect(child3.status()).toBe(NodeStatus.SUCCESS);
  });

  it("should reset child index on completion", async () => {
    const child1 = new MockAction({
      id: "child1",
      returnStatus: NodeStatus.SUCCESS,
    });
    const child2 = new MockAction({
      id: "child2",
      returnStatus: NodeStatus.SUCCESS,
    });

    selector.addChildren([child1, child2]);

    // First execution
    await selector.tick(context);
    expect((selector as unknown).currentChildIndex).toBe(0);

    // Reset children status for second execution
    child1.reset();

    // Second execution should start from beginning
    await selector.tick(context);
    expect(child1.status()).toBe(NodeStatus.SUCCESS);
  });

  it("should halt running children when halted", async () => {
    const child1 = new MockAction({
      id: "child1",
      returnStatus: NodeStatus.FAILURE,
    });
    const child2 = new MockAction({
      id: "child2",
      returnStatus: NodeStatus.RUNNING,
    });

    selector.addChildren([child1, child2]);

    // Start execution
    await selector.tick(context);
    expect(selector.status()).toBe(NodeStatus.RUNNING);

    // Halt the selector
    selector.halt();

    expect(selector.status()).toBe(NodeStatus.IDLE);
    expect((selector as unknown).currentChildIndex).toBe(0);
  });

  it("should throw error if child is undefined", () => {
    expect(() => selector.addChild(undefined as unknown)).toThrow(
      "Cannot add undefined child to composite node",
    );
  });

  describe("Signal-based cancellation", () => {
    it("should stop executing children when signal is aborted", async () => {
      const executionOrder: string[] = [];
      const controller = new AbortController();

      context.signal = controller.signal;

      const child1 = new MockAction({
        id: "child1",
        returnStatus: NodeStatus.FAILURE,
      });
      const child2 = new MockAction({
        id: "child2",
        returnStatus: NodeStatus.SUCCESS,
      });
      const child3 = new MockAction({
        id: "child3",
        returnStatus: NodeStatus.SUCCESS,
      });

      const originalTick1 = child1.tick.bind(child1);
      const originalTick2 = child2.tick.bind(child2);
      const originalTick3 = child3.tick.bind(child3);

      child1.tick = (ctx: TemporalContext) => {
        executionOrder.push("child1");
        return originalTick1(ctx);
      };
      child2.tick = (ctx: TemporalContext) => {
        executionOrder.push("child2");
        return originalTick2(ctx);
      };
      child3.tick = (ctx: TemporalContext) => {
        executionOrder.push("child3");
        return originalTick3(ctx);
      };

      selector.addChildren([child1, child2, child3]);

      // Abort signal before ticking
      controller.abort();

      try {
        await selector.tick(context);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).name).toBe("OperationCancelledError");
      }

      expect(executionOrder.length).toBe(0);
    });

    it("should respect abort signal in child iteration loop", async () => {
      const controller = new AbortController();
      const childrenExecuted: string[] = [];

      context.signal = controller.signal;

      const children = Array.from({ length: 5 }, (_, i) => {
        const child = new MockAction({
          id: `child${i}`,
          returnStatus: NodeStatus.FAILURE,
        });
        child.tick = async (ctx: TemporalContext) => {
          await checkSignal(ctx.signal);
          childrenExecuted.push(`child${i}`);
          return NodeStatus.FAILURE;
        };
        return child;
      });

      selector.addChildren(children);

      // Abort after 2 children
      let execCount = 0;
      children.forEach((child) => {
        const orig = child.tick;
        child.tick = async (ctx: TemporalContext) => {
          execCount++;
          if (execCount === 2) {
            controller.abort();
          }
          return await orig(ctx);
        };
      });

      try {
        await selector.tick(context);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).name).toBe("OperationCancelledError");
      }

      expect(childrenExecuted.length).toBeLessThanOrEqual(2);
    });
  });

  describe("ConfigurationError handling", () => {
    it(
      "should NOT catch ConfigurationError from child - it propagates up",
      async () => {
        class MisconfiguredNode extends ActionNode {
          executeTick(_context: TemporalContext) {
            throw new ConfigurationError("Element not found in blackboard");
          }
        }

        const misconfiguredChild = new MisconfiguredNode({ id: "broken" });
        const validChild = new MockAction({
          id: "valid",
          returnStatus: NodeStatus.SUCCESS,
        });

        selector.addChildren([misconfiguredChild, validChild]);

        // ConfigurationError should propagate as error
        // Selector should NOT try the next child
        try {
          await selector.tick(context);
          expect.fail("Should have thrown ConfigurationError");
        } catch (error) {
          expect(error).toBeInstanceOf(ConfigurationError);
          expect((error as ConfigurationError).message).toContain(
            "Element not found in blackboard",
          );
        }

        // Verify second child was NOT executed
        expect(validChild.status()).toBe(NodeStatus.IDLE);
      },
    );

    it("ConfigurationError from ForEach child should propagate through Selector (B1)", async () => {
      const sel = new Selector({ id: "sel-b1" });
      const forEach = new ForEach({
        id: "fe-b1",
        collectionKey: "nonArrayKey",
        itemKey: "item",
      });
      const body = new SuccessNode({ id: "body-b1" });
      forEach.addChild(body);
      sel.addChild(forEach);

      context.blackboard.set("nonArrayKey", "not-an-array");

      await expect(sel.tick(context)).rejects.toThrow(ConfigurationError);
    });
  });
});

describe("Fallback", () => {
  it("should be an alias for Selector", () => {
    const fallback = new Fallback({ id: "test-fallback" });
    expect(fallback).toBeInstanceOf(Selector);
    expect(fallback.type).toBe("Fallback");
  });

  it("should behave like Selector", async () => {
    const context: TemporalContext = {
      blackboard: new ScopedBlackboard(),
      timestamp: Date.now(),
      deltaTime: 0,
    };

    const fallback = new Fallback({ id: "test-fallback" });

    const child1 = new MockAction({
      id: "child1",
      returnStatus: NodeStatus.FAILURE,
    });
    const child2 = new MockAction({
      id: "child2",
      returnStatus: NodeStatus.SUCCESS,
    });

    fallback.addChildren([child1, child2]);

    const status = await fallback.tick(context);
    expect(status).toBe(NodeStatus.SUCCESS);
  });
});
