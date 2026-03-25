import { describe, it, expect, beforeEach } from "vitest";
import { DataTransform } from "./data-transform.js";
import { ScopedBlackboard } from "../blackboard.js";
import { NodeStatus, type TemporalContext } from "../types.js";

describe("DataTransform Node", () => {
  let blackboard: ScopedBlackboard;
  let context: TemporalContext;

  beforeEach(() => {
    blackboard = new ScopedBlackboard("root");
    context = { blackboard, timestamp: Date.now(), deltaTime: 0 };
  });

  it("builds a simple object", async () => {
    const node = new DataTransform({
      id: "dt1",
      outputKey: "result",
      mappings: [
        { target: "name", value: "hello" },
        { target: "count", value: 42 },
      ],
    });
    const status = await node.tick(context);
    expect(status).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("result")).toEqual({ name: "hello", count: 42 });
  });

  it("builds nested objects via dot notation", async () => {
    const node = new DataTransform({
      id: "dt2",
      outputKey: "result",
      mappings: [
        { target: "metricName", value: "inventory_level" },
        { target: "context_json.totalOrders", value: 5 },
        { target: "context_json.threshold", value: 10 },
      ],
    });
    await node.tick(context);
    expect(blackboard.get("result")).toEqual({
      metricName: "inventory_level",
      context_json: { totalOrders: 5, threshold: 10 },
    });
  });

  it("resolves blackboard variables", async () => {
    blackboard.set("rate", 24.5);
    blackboard.set("orderCount", 100);
    const node = new DataTransform({
      id: "dt3",
      outputKey: "result",
      mappings: [
        { target: "hourlyRate", value: "${bb.rate}" },
        { target: "count", value: "${bb.orderCount}" },
      ],
    });
    await node.tick(context);
    expect(blackboard.get("result")).toEqual({ hourlyRate: 24.5, count: 100 });
  });

  it("wraps result in array", async () => {
    const node = new DataTransform({
      id: "dt4",
      outputKey: "result",
      wrapInArray: true,
      mappings: [
        { target: "metricName", value: "test" },
        { target: "value", value: 42 },
      ],
    });
    await node.tick(context);
    expect(blackboard.get("result")).toEqual([{ metricName: "test", value: 42 }]);
  });

  it("coerces to number", async () => {
    blackboard.set("strNum", "42.5");
    const node = new DataTransform({
      id: "dt5",
      outputKey: "result",
      mappings: [
        { target: "qty", value: "${bb.strNum}", coerce: "number" },
      ],
    });
    await node.tick(context);
    expect((blackboard.get("result") as any).qty).toBe(42.5);
  });

  it("coerces to string", async () => {
    blackboard.set("num", 42);
    const node = new DataTransform({
      id: "dt6",
      outputKey: "result",
      mappings: [
        { target: "id", value: "${bb.num}", coerce: "string" },
      ],
    });
    await node.tick(context);
    expect((blackboard.get("result") as any).id).toBe("42");
  });

  it("coerces to boolean", async () => {
    const node = new DataTransform({
      id: "dt7",
      outputKey: "result",
      mappings: [
        { target: "a", value: "true", coerce: "boolean" },
        { target: "b", value: "false", coerce: "boolean" },
        { target: "c", value: 1, coerce: "boolean" },
        { target: "d", value: 0, coerce: "boolean" },
      ],
    });
    await node.tick(context);
    const result = blackboard.get("result") as any;
    expect(result.a).toBe(true);
    expect(result.b).toBe(false);
    expect(result.c).toBe(true);
    expect(result.d).toBe(false);
  });

  it("returns FAILURE when coerce to number fails", async () => {
    blackboard.set("bad", "not-a-number");
    const node = new DataTransform({
      id: "dt8",
      outputKey: "result",
      mappings: [
        { target: "qty", value: "${bb.bad}", coerce: "number" },
      ],
    });
    const status = await node.tick(context);
    expect(status).toBe(NodeStatus.FAILURE);
  });

  it("handles deeply nested targets", async () => {
    const node = new DataTransform({
      id: "dt9",
      outputKey: "result",
      mappings: [
        { target: "a.b.c.d", value: "deep" },
      ],
    });
    await node.tick(context);
    expect(blackboard.get("result")).toEqual({ a: { b: { c: { d: "deep" } } } });
  });

  it("preserves resolved objects", async () => {
    blackboard.set("breakdown", { paid: 3, pending: 2 });
    const node = new DataTransform({
      id: "dt10",
      outputKey: "result",
      mappings: [
        { target: "statusBreakdown", value: "${bb.breakdown}" },
      ],
    });
    await node.tick(context);
    expect((blackboard.get("result") as any).statusBreakdown).toEqual({ paid: 3, pending: 2 });
  });

  it("builds metric snapshot pattern", async () => {
    blackboard.set("hourlyRate", 4.2);
    blackboard.set("orderCount", 10);
    blackboard.set("revenue", 500);
    const node = new DataTransform({
      id: "dt11",
      outputKey: "snapshotData",
      wrapInArray: true,
      mappings: [
        { target: "metricName", value: "order_volume_hourly" },
        { target: "value", value: "${bb.hourlyRate}" },
        { target: "dimensions", value: {} },
        { target: "source", value: "computed" },
        { target: "context_json.orderCount", value: "${bb.orderCount}" },
        { target: "context_json.totalRevenue", value: "${bb.revenue}" },
      ],
    });
    await node.tick(context);
    const result = blackboard.get("snapshotData") as any[];
    expect(result).toHaveLength(1);
    expect(result[0].metricName).toBe("order_volume_hourly");
    expect(result[0].value).toBe(4.2);
    expect(result[0].context_json.orderCount).toBe(10);
  });
});
