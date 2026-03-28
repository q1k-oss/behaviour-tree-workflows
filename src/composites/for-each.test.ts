/**
 * Tests for ForEach node
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ScopedBlackboard } from "../blackboard.js";
import { ConfigurationError } from "../errors.js";
import { SuccessNode } from "../test-nodes.js";
import { type TemporalContext, NodeStatus } from "../types.js";
import { ForEach } from "./for-each.js";

describe("ForEach", () => {
  let blackboard: ScopedBlackboard;
  let context: TemporalContext;

  beforeEach(() => {
    blackboard = new ScopedBlackboard("root");
    context = {
      blackboard,
      timestamp: Date.now(),
      deltaTime: 0,
    };
  });

  describe("Basic Functionality", () => {
    it("should iterate over collection", async () => {
      const forEach = new ForEach({
        id: "forEach1",
        collectionKey: "items",
        itemKey: "currentItem",
      });

      const items = ["a", "b", "c"];
      blackboard.set("items", items);

      const processedItems: string[] = [];
      class RecordingNode extends SuccessNode {
        async tick(context: TemporalContext): Promise<NodeStatus> {
          const superTick = super.tick.bind(this);
          const item = context.blackboard.get("currentItem");
          processedItems.push(item);
          return await superTick(context);
        }
      }

      forEach.addChild(new RecordingNode({ id: "body" }));

      const result = await forEach.tick(context);
      expect(result).toBe(NodeStatus.SUCCESS);
      expect(processedItems).toEqual(["a", "b", "c"]);
    });

    it("should set item and index in blackboard", async () => {
      const forEach = new ForEach({
        id: "forEach1",
        collectionKey: "numbers",
        itemKey: "num",
        indexKey: "i",
      });

      blackboard.set("numbers", [10, 20, 30]);

      const recorded: Array<{ item: number; index: number }> = [];
      class RecordingNode extends SuccessNode {
        async tick(context: TemporalContext): Promise<NodeStatus> {
          const superTick = super.tick.bind(this);
          recorded.push({
            item: context.blackboard.get("num"),
            index: context.blackboard.get("i"),
          });
          return await superTick(context);
        }
      }

      forEach.addChild(new RecordingNode({ id: "body" }));

      await forEach.tick(context);

      expect(recorded).toEqual([
        { item: 10, index: 0 },
        { item: 20, index: 1 },
        { item: 30, index: 2 },
      ]);
    });
  });

  describe("Failure Handling", () => {
    it("should fail on first failure", async () => {
      const forEach = new ForEach({
        id: "forEach1",
        collectionKey: "items",
        itemKey: "item",
      });

      blackboard.set("items", ["a", "b", "c"]);

      let tickCount = 0;
      class FailOnSecond extends SuccessNode {
        async tick(context: TemporalContext): Promise<NodeStatus> {
          const superTick = super.tick.bind(this);
          tickCount++;
          if (tickCount === 2) {
            this._status = NodeStatus.FAILURE;
            return NodeStatus.FAILURE;
          }
          return await superTick(context);
        }
      }

      forEach.addChild(new FailOnSecond({ id: "body" }));

      const result = await forEach.tick(context);
      expect(result).toBe(NodeStatus.FAILURE);
      expect(tickCount).toBe(2); // Only processed 2 items
    });

    it("should fail if collection not found", async () => {
      const forEach = new ForEach({
        id: "forEach1",
        collectionKey: "missing",
        itemKey: "item",
      });

      forEach.addChild(new SuccessNode({ id: "body" }));

      const result = await forEach.tick(context);
      expect(result).toBe(NodeStatus.FAILURE);
    });

    it("should throw ConfigurationError if collection is not an array", async () => {
      const forEach = new ForEach({
        id: "forEach1",
        collectionKey: "notArray",
        itemKey: "item",
      });

      blackboard.set("notArray", "not an array");
      forEach.addChild(new SuccessNode({ id: "body" }));

      await expect(forEach.tick(context)).rejects.toThrow(ConfigurationError);
    });
  });

  describe("RUNNING State", () => {
    it("should resume from saved index on RUNNING", async () => {
      const forEach = new ForEach({
        id: "forEach1",
        collectionKey: "items",
        itemKey: "item",
      });

      blackboard.set("items", ["a", "b", "c"]);

      let tickCount = 0;
      class RunningOnSecond extends SuccessNode {
        async tick(context: TemporalContext): Promise<NodeStatus> {
          const superTick = super.tick.bind(this);
          tickCount++;
          if (tickCount === 2) {
            this._status = NodeStatus.RUNNING;
            return NodeStatus.RUNNING;
          }
          return await superTick(context);
        }
      }

      const body = new RunningOnSecond({ id: "body" });
      forEach.addChild(body);

      // First tick: processes item 0, returns RUNNING on item 1
      let result = await forEach.tick(context);
      expect(result).toBe(NodeStatus.RUNNING);
      expect(tickCount).toBe(2);

      // Second tick: should resume from item 1
      result = await forEach.tick(context);
      expect(result).toBe(NodeStatus.SUCCESS);
      expect(tickCount).toBe(4); // item 1 (again), item 2
    });
  });

  describe("Edge Cases", () => {
    it("should return SUCCESS for empty collection", async () => {
      const forEach = new ForEach({
        id: "forEach1",
        collectionKey: "empty",
        itemKey: "item",
      });

      blackboard.set("empty", []);
      forEach.addChild(new SuccessNode({ id: "body" }));

      const result = await forEach.tick(context);
      expect(result).toBe(NodeStatus.SUCCESS);
    });

    it("should reset index on success", async () => {
      const forEach = new ForEach({
        id: "forEach1",
        collectionKey: "items",
        itemKey: "item",
      });

      blackboard.set("items", ["a", "b"]);

      let firstRunCount = 0;
      let secondRunCount = 0;

      class CountingNode extends SuccessNode {
        async tick(context: TemporalContext): Promise<NodeStatus> {
          const superTick = super.tick.bind(this);
          if (secondRunCount > 0) {
            secondRunCount++;
          } else {
            firstRunCount++;
          }
          return await superTick(context);
        }
      }

      forEach.addChild(new CountingNode({ id: "body" }));

      // First execution
      await forEach.tick(context);
      expect(firstRunCount).toBe(2);

      // Second execution should start from beginning
      secondRunCount = 1;
      await forEach.tick(context);
      expect(secondRunCount).toBe(3); // Initial 1 + 2 items
    });

    it("should resolve dot-path collectionKey", async () => {
      const forEach = new ForEach({
        id: "forEach1",
        collectionKey: "currentProduct.variants",
        itemKey: "currentVariant",
      });

      blackboard.set("currentProduct", {
        title: "T-Shirt",
        variants: [
          { sku: "TSH-S", inventory_quantity: 0 },
          { sku: "TSH-M", inventory_quantity: 5 },
        ],
      });

      const skus: string[] = [];
      class RecordSku extends SuccessNode {
        async tick(ctx: TemporalContext): Promise<NodeStatus> {
          const variant = ctx.blackboard.get("currentVariant") as { sku: string };
          skus.push(variant.sku);
          return await super.tick(ctx);
        }
      }

      forEach.addChild(new RecordSku({ id: "body" }));
      const result = await forEach.tick(context);
      expect(result).toBe(NodeStatus.SUCCESS);
      expect(skus).toEqual(["TSH-S", "TSH-M"]);
    });

    it("should resolve bracket notation in collectionKey", async () => {
      blackboard.set("data", { groups: [{ items: ["a", "b"] }] });

      const forEach = new ForEach({
        id: "bracket-test",
        collectionKey: "data.groups[0].items",
        itemKey: "currentItem",
      });

      const body = new SuccessNode({ id: "body-bracket" });
      forEach.addChild(body);

      const result = await forEach.tick(context);
      expect(result).toBe(NodeStatus.SUCCESS);
      // Last item should be set on blackboard
      expect(blackboard.get("currentItem")).toBe("b");
    });

    it("should propagate ConfigurationError with no child", async () => {
      const forEach = new ForEach({
        id: "forEach1",
        collectionKey: "items",
        itemKey: "item",
      });

      blackboard.set("items", ["a"]);

      try {
        await forEach.tick(context);
        expect.fail("Should have thrown ConfigurationError");
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect((error as ConfigurationError).message).toContain(
          "ForEach requires at least one child",
        );
      }
    });
  });
});
