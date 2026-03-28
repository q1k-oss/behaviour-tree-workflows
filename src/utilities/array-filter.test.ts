import { describe, it, expect, beforeEach } from "vitest";
import { ArrayFilter } from "./array-filter.js";
import { ScopedBlackboard } from "../blackboard.js";
import { ConfigurationError } from "../errors.js";
import { NodeStatus, type TemporalContext } from "../types.js";

describe("ArrayFilter Node", () => {
  let blackboard: ScopedBlackboard;
  let context: TemporalContext;

  beforeEach(() => {
    blackboard = new ScopedBlackboard("root");
    context = { blackboard, timestamp: Date.now(), deltaTime: 0 };
  });

  it("filters by equality", async () => {
    blackboard.set("orders", [
      { status: "paid", id: 1 },
      { status: "pending", id: 2 },
      { status: "paid", id: 3 },
    ]);
    const node = new ArrayFilter({
      id: "f1",
      input: "${bb.orders}",
      outputKey: "paidOrders",
      conditions: [{ field: "status", operator: "eq", value: "paid" }],
    });
    const status = await node.tick(context);
    expect(status).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("paidOrders")).toEqual([
      { status: "paid", id: 1 },
      { status: "paid", id: 3 },
    ]);
  });

  it("filters by in operator with null", async () => {
    blackboard.set("orders", [
      { fulfillment_status: null },
      { fulfillment_status: "unfulfilled" },
      { fulfillment_status: "fulfilled" },
    ]);
    const node = new ArrayFilter({
      id: "f2",
      input: "${bb.orders}",
      outputKey: "result",
      conditions: [{ field: "fulfillment_status", operator: "in", value: [null, "unfulfilled"] }],
    });
    await node.tick(context);
    expect(blackboard.get("result")).toHaveLength(2);
  });

  it("filters by gt operator", async () => {
    blackboard.set("items", [
      { qty: 0 }, { qty: 5 }, { qty: 15 }, { qty: 20 },
    ]);
    const node = new ArrayFilter({
      id: "f3",
      input: "${bb.items}",
      outputKey: "result",
      conditions: [{ field: "qty", operator: "gt", value: 10 }],
    });
    await node.tick(context);
    expect(blackboard.get("result")).toEqual([{ qty: 15 }, { qty: 20 }]);
  });

  it("filters with multiple AND conditions", async () => {
    blackboard.set("items", [
      { qty: 5, status: "active" },
      { qty: 15, status: "active" },
      { qty: 5, status: "inactive" },
    ]);
    const node = new ArrayFilter({
      id: "f4",
      input: "${bb.items}",
      outputKey: "result",
      conditions: [
        { field: "qty", operator: "lte", value: 10 },
        { field: "status", operator: "eq", value: "active" },
      ],
      logic: "and",
    });
    await node.tick(context);
    expect(blackboard.get("result")).toEqual([{ qty: 5, status: "active" }]);
  });

  it("filters with OR logic", async () => {
    blackboard.set("items", [
      { qty: 0 }, { qty: 5 }, { qty: 100 },
    ]);
    const node = new ArrayFilter({
      id: "f5",
      input: "${bb.items}",
      outputKey: "result",
      conditions: [
        { field: "qty", operator: "eq", value: 0 },
        { field: "qty", operator: "gte", value: 100 },
      ],
      logic: "or",
    });
    await node.tick(context);
    expect(blackboard.get("result")).toEqual([{ qty: 0 }, { qty: 100 }]);
  });

  it("handles nested field paths", async () => {
    blackboard.set("orders", [
      { shipping: { carrier: "ups" } },
      { shipping: { carrier: "fedex" } },
    ]);
    const node = new ArrayFilter({
      id: "f6",
      input: "${bb.orders}",
      outputKey: "result",
      conditions: [{ field: "shipping.carrier", operator: "eq", value: "ups" }],
    });
    await node.tick(context);
    expect(blackboard.get("result")).toEqual([{ shipping: { carrier: "ups" } }]);
  });

  it("handles exists operator", async () => {
    blackboard.set("items", [
      { name: "a", tag: "x" },
      { name: "b" },
      { name: "c", tag: null },
    ]);
    const node = new ArrayFilter({
      id: "f7",
      input: "${bb.items}",
      outputKey: "result",
      conditions: [{ field: "tag", operator: "exists", value: true }],
    });
    await node.tick(context);
    expect(blackboard.get("result")).toEqual([{ name: "a", tag: "x" }]);
  });

  it("handles regex operator", async () => {
    blackboard.set("items", [
      { email: "test@example.com" },
      { email: "bad" },
      { email: "hello@foo.org" },
    ]);
    const node = new ArrayFilter({
      id: "f8",
      input: "${bb.items}",
      outputKey: "result",
      conditions: [{ field: "email", operator: "regex", value: "^[^@]+@[^@]+\\.[a-z]+$" }],
    });
    await node.tick(context);
    expect(blackboard.get("result")).toHaveLength(2);
  });

  it("handles between operator", async () => {
    blackboard.set("items", [{ v: 1 }, { v: 5 }, { v: 10 }, { v: 15 }]);
    const node = new ArrayFilter({
      id: "f9",
      input: "${bb.items}",
      outputKey: "result",
      conditions: [{ field: "v", operator: "between", range: [5, 10] }],
    });
    await node.tick(context);
    expect(blackboard.get("result")).toEqual([{ v: 5 }, { v: 10 }]);
  });

  it("handles contains operator for strings", async () => {
    blackboard.set("items", [{ name: "hello world" }, { name: "foo" }]);
    const node = new ArrayFilter({
      id: "f10",
      input: "${bb.items}",
      outputKey: "result",
      conditions: [{ field: "name", operator: "contains", value: "world" }],
    });
    await node.tick(context);
    expect(blackboard.get("result")).toEqual([{ name: "hello world" }]);
  });

  it("returns empty array for no matches (SUCCESS)", async () => {
    blackboard.set("items", [{ v: 1 }, { v: 2 }]);
    const node = new ArrayFilter({
      id: "f11",
      input: "${bb.items}",
      outputKey: "result",
      conditions: [{ field: "v", operator: "gt", value: 100 }],
    });
    const status = await node.tick(context);
    expect(status).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("result")).toEqual([]);
  });

  it("throws ConfigurationError when input is missing", async () => {
    const node = new ArrayFilter({
      id: "f12",
      input: "${bb.missing}",
      outputKey: "result",
      conditions: [{ field: "x", operator: "eq", value: 1 }],
    });
    await expect(node.tick(context)).rejects.toThrow(ConfigurationError);
  });

  it("resolves variable in condition value", async () => {
    blackboard.set("items", [{ qty: 5 }, { qty: 15 }]);
    blackboard.set("threshold", 10);
    const node = new ArrayFilter({
      id: "f13",
      input: "${bb.items}",
      outputKey: "result",
      conditions: [{ field: "qty", operator: "gt", value: "${bb.threshold}" }],
    });
    await node.tick(context);
    expect(blackboard.get("result")).toEqual([{ qty: 15 }]);
  });
});
