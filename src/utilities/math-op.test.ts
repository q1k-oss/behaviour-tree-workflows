import { describe, it, expect, beforeEach } from "vitest";
import { MathOp, safeEvaluate } from "./math-op.js";
import { ScopedBlackboard } from "../blackboard.js";
import { NodeStatus, type TemporalContext } from "../types.js";

describe("safeEvaluate", () => {
  it("basic arithmetic", () => {
    expect(safeEvaluate("2 + 3")).toBe(5);
    expect(safeEvaluate("10 - 4")).toBe(6);
    expect(safeEvaluate("3 * 7")).toBe(21);
    expect(safeEvaluate("15 / 3")).toBe(5);
    expect(safeEvaluate("10 % 3")).toBe(1);
  });

  it("operator precedence", () => {
    expect(safeEvaluate("2 + 3 * 4")).toBe(14);
    expect(safeEvaluate("10 - 2 * 3")).toBe(4);
    expect(safeEvaluate("6 / 2 + 1")).toBe(4);
  });

  it("parentheses", () => {
    expect(safeEvaluate("(2 + 3) * 4")).toBe(20);
    expect(safeEvaluate("10 / (2 + 3)")).toBe(2);
    expect(safeEvaluate("((1 + 2) * (3 + 4))")).toBe(21);
  });

  it("unary minus", () => {
    expect(safeEvaluate("-5")).toBe(-5);
    expect(safeEvaluate("-5 + 3")).toBe(-2);
    expect(safeEvaluate("-(3 + 2)")).toBe(-5);
  });

  it("decimals", () => {
    expect(safeEvaluate("1.5 + 2.5")).toBe(4);
    expect(safeEvaluate("0.1 * 10")).toBeCloseTo(1);
  });

  it("division by zero throws", () => {
    expect(() => safeEvaluate("5 / 0")).toThrow("Division by zero");
    expect(() => safeEvaluate("5 % 0")).toThrow("Division by zero");
  });

  it("empty expression throws", () => {
    expect(() => safeEvaluate("")).toThrow("Empty expression");
  });

  it("invalid characters throw", () => {
    expect(() => safeEvaluate("2 + abc")).toThrow("Unexpected character");
  });

  it("missing parenthesis throws", () => {
    expect(() => safeEvaluate("(2 + 3")).toThrow("Missing closing parenthesis");
  });
});

describe("MathOp Node", () => {
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

  it("evaluates simple expression", async () => {
    const node = new MathOp({
      id: "math1",
      expression: "2 + 3",
      outputKey: "result",
    });
    const status = await node.tick(context);
    expect(status).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("result")).toBe(5);
  });

  it("resolves blackboard variables", async () => {
    blackboard.set("orderCount", 24);
    blackboard.set("lookbackMinutes", 60);
    const node = new MathOp({
      id: "math2",
      expression: "${bb.orderCount} / (${bb.lookbackMinutes} / 60)",
      outputKey: "hourlyRate",
    });
    const status = await node.tick(context);
    expect(status).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("hourlyRate")).toBe(24);
  });

  it("applies rounding", async () => {
    blackboard.set("count", 7);
    blackboard.set("total", 3);
    const node = new MathOp({
      id: "math3",
      expression: "${bb.count} / ${bb.total}",
      outputKey: "avg",
      round: "round",
      precision: 1,
    });
    const status = await node.tick(context);
    expect(status).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("avg")).toBe(2.3);
  });

  it("applies floor rounding", async () => {
    const node = new MathOp({
      id: "math4",
      expression: "7 / 3",
      outputKey: "result",
      round: "floor",
      precision: 2,
    });
    await node.tick(context);
    expect(blackboard.get("result")).toBe(2.33);
  });

  it("applies ceil rounding", async () => {
    const node = new MathOp({
      id: "math5",
      expression: "7 / 3",
      outputKey: "result",
      round: "ceil",
      precision: 2,
    });
    await node.tick(context);
    expect(blackboard.get("result")).toBe(2.34);
  });

  it("returns FAILURE on division by zero", async () => {
    blackboard.set("x", 5);
    blackboard.set("y", 0);
    const node = new MathOp({
      id: "math6",
      expression: "${bb.x} / ${bb.y}",
      outputKey: "result",
    });
    const status = await node.tick(context);
    expect(status).toBe(NodeStatus.FAILURE);
  });

  it("handles single variable reference", async () => {
    blackboard.set("value", 42);
    const node = new MathOp({
      id: "math7",
      expression: "${bb.value}",
      outputKey: "result",
    });
    const status = await node.tick(context);
    expect(status).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("result")).toBe(42);
  });

  it("returns FAILURE for non-numeric variable", async () => {
    blackboard.set("value", "hello");
    const node = new MathOp({
      id: "math8",
      expression: "${bb.value} + 1",
      outputKey: "result",
    });
    const status = await node.tick(context);
    expect(status).toBe(NodeStatus.FAILURE);
  });

  it("computes timestamp arithmetic", async () => {
    const now = Date.now();
    blackboard.set("now", now);
    blackboard.set("minutes", 60);
    const node = new MathOp({
      id: "math9",
      expression: "${bb.now} - ${bb.minutes} * 60 * 1000",
      outputKey: "cutoff",
    });
    const status = await node.tick(context);
    expect(status).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("cutoff")).toBe(now - 60 * 60 * 1000);
  });
});
