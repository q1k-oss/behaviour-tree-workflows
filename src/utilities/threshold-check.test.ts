import { describe, it, expect, beforeEach } from "vitest";
import { ThresholdCheck } from "./threshold-check.js";
import { ScopedBlackboard } from "../blackboard.js";
import { NodeStatus, type TemporalContext } from "../types.js";

describe("ThresholdCheck Node", () => {
  let blackboard: ScopedBlackboard;
  let context: TemporalContext;

  beforeEach(() => {
    blackboard = new ScopedBlackboard("root");
    context = { blackboard, timestamp: Date.now(), deltaTime: 0 };
  });

  it("matches first threshold (out_of_stock)", async () => {
    const node = new ThresholdCheck({
      id: "tc1",
      value: 0,
      thresholds: [
        { operator: "lte", value: 0, label: "out_of_stock" },
        { operator: "lte", value: 10, label: "low_stock" },
      ],
      outputKey: "status",
    });
    const status = await node.tick(context);
    expect(status).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("status")).toBe("out_of_stock");
  });

  it("matches second threshold (low_stock)", async () => {
    const node = new ThresholdCheck({
      id: "tc2",
      value: 5,
      thresholds: [
        { operator: "lte", value: 0, label: "out_of_stock" },
        { operator: "lte", value: 10, label: "low_stock" },
      ],
      outputKey: "status",
    });
    await node.tick(context);
    expect(blackboard.get("status")).toBe("low_stock");
  });

  it("defaults to normal when no threshold matches", async () => {
    const node = new ThresholdCheck({
      id: "tc3",
      value: 100,
      thresholds: [
        { operator: "lte", value: 0, label: "out_of_stock" },
        { operator: "lte", value: 10, label: "low_stock" },
      ],
      outputKey: "status",
    });
    await node.tick(context);
    expect(blackboard.get("status")).toBe("normal");
  });

  it("returns FAILURE when label is in failOn", async () => {
    const node = new ThresholdCheck({
      id: "tc4",
      value: 0,
      thresholds: [
        { operator: "lte", value: 0, label: "out_of_stock" },
      ],
      outputKey: "status",
      failOn: ["out_of_stock"],
    });
    const status = await node.tick(context);
    expect(status).toBe(NodeStatus.FAILURE);
    expect(blackboard.get("status")).toBe("out_of_stock");
  });

  it("returns SUCCESS when label not in failOn", async () => {
    const node = new ThresholdCheck({
      id: "tc5",
      value: 5,
      thresholds: [
        { operator: "lte", value: 0, label: "out_of_stock" },
        { operator: "lte", value: 10, label: "low_stock" },
      ],
      outputKey: "status",
      failOn: ["out_of_stock"],
    });
    const status = await node.tick(context);
    expect(status).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("status")).toBe("low_stock");
  });

  it("resolves blackboard variable in value", async () => {
    blackboard.set("qty", 3);
    blackboard.set("threshold", 5);
    const node = new ThresholdCheck({
      id: "tc6",
      value: "${bb.qty}",
      thresholds: [
        { operator: "lte", value: "${bb.threshold}", label: "low" },
      ],
      outputKey: "status",
    });
    await node.tick(context);
    expect(blackboard.get("status")).toBe("low");
  });

  it("handles gte operator", async () => {
    const node = new ThresholdCheck({
      id: "tc7",
      value: 150,
      thresholds: [
        { operator: "gte", value: 100, label: "critical_spike" },
        { operator: "gte", value: 50, label: "warning_spike" },
      ],
      outputKey: "status",
    });
    await node.tick(context);
    expect(blackboard.get("status")).toBe("critical_spike");
  });

  it("handles between operator", async () => {
    const node = new ThresholdCheck({
      id: "tc8",
      value: 7,
      thresholds: [
        { operator: "between", range: [5, 10], label: "moderate" },
      ],
      outputKey: "status",
    });
    await node.tick(context);
    expect(blackboard.get("status")).toBe("moderate");
  });

  it("returns FAILURE for non-numeric value", async () => {
    const node = new ThresholdCheck({
      id: "tc9",
      value: "hello",
      thresholds: [
        { operator: "lte", value: 10, label: "low" },
      ],
      outputKey: "status",
    });
    const status = await node.tick(context);
    expect(status).toBe(NodeStatus.FAILURE);
  });

  it("handles eq operator", async () => {
    const node = new ThresholdCheck({
      id: "tc10",
      value: 42,
      thresholds: [
        { operator: "eq", value: 42, label: "exact" },
      ],
      outputKey: "status",
    });
    await node.tick(context);
    expect(blackboard.get("status")).toBe("exact");
  });

  it("handles ne operator", async () => {
    const node = new ThresholdCheck({
      id: "tc11",
      value: 5,
      thresholds: [
        { operator: "ne", value: 0, label: "nonzero" },
      ],
      outputKey: "status",
    });
    await node.tick(context);
    expect(blackboard.get("status")).toBe("nonzero");
  });

  it("works without outputKey", async () => {
    const node = new ThresholdCheck({
      id: "tc12",
      value: 0,
      thresholds: [
        { operator: "lte", value: 0, label: "out_of_stock" },
      ],
      failOn: ["out_of_stock"],
    });
    const status = await node.tick(context);
    expect(status).toBe(NodeStatus.FAILURE);
  });
});
