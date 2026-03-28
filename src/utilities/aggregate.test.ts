import { describe, it, expect, beforeEach } from "vitest";
import { Aggregate } from "./aggregate.js";
import { ScopedBlackboard } from "../blackboard.js";
import { ConfigurationError } from "../errors.js";
import { NodeStatus, type TemporalContext } from "../types.js";

describe("Aggregate Node", () => {
  let blackboard: ScopedBlackboard;
  let context: TemporalContext;

  beforeEach(() => {
    blackboard = new ScopedBlackboard("root");
    context = { blackboard, timestamp: Date.now(), deltaTime: 0 };
  });

  it("counts items", async () => {
    blackboard.set("items", [1, 2, 3, 4, 5]);
    const node = new Aggregate({
      id: "agg1",
      input: "${bb.items}",
      outputKey: "result",
      operations: [{ type: "count", as: "total" }],
    });
    await node.tick(context);
    expect(blackboard.get("result")).toEqual({ total: 5 });
  });

  it("computes sum", async () => {
    blackboard.set("orders", [
      { total_price: "100.50" },
      { total_price: "200.25" },
      { total_price: "50.00" },
    ]);
    const node = new Aggregate({
      id: "agg2",
      input: "${bb.orders}",
      outputKey: "result",
      operations: [{ type: "sum", field: "total_price", as: "totalRevenue" }],
    });
    await node.tick(context);
    expect((blackboard.get("result") as any).totalRevenue).toBeCloseTo(350.75);
  });

  it("computes avg", async () => {
    blackboard.set("items", [{ v: 10 }, { v: 20 }, { v: 30 }]);
    const node = new Aggregate({
      id: "agg3",
      input: "${bb.items}",
      outputKey: "result",
      operations: [{ type: "avg", field: "v", as: "average" }],
    });
    await node.tick(context);
    expect((blackboard.get("result") as any).average).toBe(20);
  });

  it("computes min and max", async () => {
    blackboard.set("items", [{ v: 5 }, { v: 1 }, { v: 9 }, { v: 3 }]);
    const node = new Aggregate({
      id: "agg4",
      input: "${bb.items}",
      outputKey: "result",
      operations: [
        { type: "min", field: "v", as: "lowest" },
        { type: "max", field: "v", as: "highest" },
      ],
    });
    await node.tick(context);
    const result = blackboard.get("result") as any;
    expect(result.lowest).toBe(1);
    expect(result.highest).toBe(9);
  });

  it("computes multiple operations", async () => {
    blackboard.set("orders", [
      { total_price: 100 },
      { total_price: 200 },
      { total_price: 300 },
    ]);
    const node = new Aggregate({
      id: "agg5",
      input: "${bb.orders}",
      outputKey: "result",
      operations: [
        { type: "count", as: "orderCount" },
        { type: "sum", field: "total_price", as: "totalRevenue" },
        { type: "avg", field: "total_price", as: "avgOrder" },
      ],
    });
    await node.tick(context);
    const result = blackboard.get("result") as any;
    expect(result.orderCount).toBe(3);
    expect(result.totalRevenue).toBe(600);
    expect(result.avgOrder).toBe(200);
  });

  it("groups by field", async () => {
    blackboard.set("orders", [
      { status: "paid", amount: 100 },
      { status: "pending", amount: 50 },
      { status: "paid", amount: 200 },
      { status: "pending", amount: 75 },
      { status: "refunded", amount: 30 },
    ]);
    const node = new Aggregate({
      id: "agg6",
      input: "${bb.orders}",
      outputKey: "result",
      operations: [{ type: "count" }],
      groupBy: "status",
    });
    await node.tick(context);
    const result = blackboard.get("result") as any;
    expect(result.paid.count).toBe(2);
    expect(result.pending.count).toBe(2);
    expect(result.refunded.count).toBe(1);
  });

  it("groups with sum", async () => {
    blackboard.set("orders", [
      { status: "paid", amount: 100 },
      { status: "paid", amount: 200 },
      { status: "pending", amount: 50 },
    ]);
    const node = new Aggregate({
      id: "agg7",
      input: "${bb.orders}",
      outputKey: "result",
      operations: [
        { type: "count", as: "orderCount" },
        { type: "sum", field: "amount", as: "total" },
      ],
      groupBy: "status",
    });
    await node.tick(context);
    const result = blackboard.get("result") as any;
    expect(result.paid).toEqual({ orderCount: 2, total: 300 });
    expect(result.pending).toEqual({ orderCount: 1, total: 50 });
  });

  it("handles empty array", async () => {
    blackboard.set("items", []);
    const node = new Aggregate({
      id: "agg8",
      input: "${bb.items}",
      outputKey: "result",
      operations: [
        { type: "count", as: "total" },
        { type: "sum", field: "v", as: "sum" },
        { type: "min", field: "v", as: "min" },
      ],
    });
    const status = await node.tick(context);
    expect(status).toBe(NodeStatus.SUCCESS);
    const result = blackboard.get("result") as any;
    expect(result.total).toBe(0);
    expect(result.sum).toBe(0);
    expect(result.min).toBe(null);
  });

  it("skips NaN values in sum", async () => {
    blackboard.set("items", [
      { v: 10 }, { v: "bad" }, { v: 20 },
    ]);
    const node = new Aggregate({
      id: "agg9",
      input: "${bb.items}",
      outputKey: "result",
      operations: [{ type: "sum", field: "v", as: "total" }],
    });
    await node.tick(context);
    expect((blackboard.get("result") as any).total).toBe(30);
  });

  it("throws ConfigurationError for missing input", async () => {
    const node = new Aggregate({
      id: "agg10",
      input: "${bb.missing}",
      outputKey: "result",
      operations: [{ type: "count" }],
    });
    await expect(node.tick(context)).rejects.toThrow(ConfigurationError);
  });

  it("handles nested field in aggregation", async () => {
    blackboard.set("items", [
      { detail: { price: 10 } },
      { detail: { price: 20 } },
    ]);
    const node = new Aggregate({
      id: "agg11",
      input: "${bb.items}",
      outputKey: "result",
      operations: [{ type: "sum", field: "detail.price", as: "total" }],
    });
    await node.tick(context);
    expect((blackboard.get("result") as any).total).toBe(30);
  });

  it("groups null keys under __null__", async () => {
    blackboard.set("items", [
      { cat: "a", v: 1 },
      { cat: null, v: 2 },
      { v: 3 },
    ]);
    const node = new Aggregate({
      id: "agg12",
      input: "${bb.items}",
      outputKey: "result",
      operations: [{ type: "count" }],
      groupBy: "cat",
    });
    await node.tick(context);
    const result = blackboard.get("result") as any;
    expect(result.a.count).toBe(1);
    expect(result.__null__.count).toBe(2);
  });
});
