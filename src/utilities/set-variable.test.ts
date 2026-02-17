/**
 * Tests for SetVariable Node
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type TemporalContext,
  NodeStatus,
  ScopedBlackboard,
} from "../index.js";
import { SetVariable } from "./set-variable.js";

describe("SetVariable", () => {
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

  it("should set a string value", async () => {
    const node = new SetVariable({
      id: "sv-1",
      key: "greeting",
      value: "hello",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("greeting")).toBe("hello");
  });

  it("should set a number value", async () => {
    const node = new SetVariable({
      id: "sv-2",
      key: "count",
      value: 42,
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("count")).toBe(42);
  });

  it("should set a boolean value", async () => {
    const node = new SetVariable({
      id: "sv-3",
      key: "agentLooping",
      value: true,
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("agentLooping")).toBe(true);
  });

  it("should set false to stop a loop", async () => {
    blackboard.set("agentLooping", true);

    const node = new SetVariable({
      id: "sv-4",
      key: "agentLooping",
      value: false,
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("agentLooping")).toBe(false);
  });

  it("should set an object value", async () => {
    const node = new SetVariable({
      id: "sv-5",
      key: "config",
      value: { maxRetries: 3, timeout: 5000 },
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("config")).toEqual({ maxRetries: 3, timeout: 5000 });
  });

  it("should set null value", async () => {
    blackboard.set("toRemove", "something");

    const node = new SetVariable({
      id: "sv-6",
      key: "toRemove",
      value: null,
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("toRemove")).toBeNull();
  });

  it("should resolve variable in value", async () => {
    blackboard.set("source", "resolved-value");

    const node = new SetVariable({
      id: "sv-7",
      key: "target",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional variable resolution
      value: "${bb.source}",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("target")).toBe("resolved-value");
  });

  it("should resolve variable from input", async () => {
    const contextWithInput: TemporalContext = {
      ...context,
      input: Object.freeze({ task: "summarize documents" }),
    };

    const node = new SetVariable({
      id: "sv-8",
      key: "userMessage",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional variable resolution
      value: "${input.task}",
    });

    const result = await node.tick(contextWithInput);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("userMessage")).toBe("summarize documents");
  });

  it("should resolve variable in key", async () => {
    blackboard.set("dynamicKeyName", "myKey");

    const node = new SetVariable({
      id: "sv-9",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional variable resolution
      key: "${bb.dynamicKeyName}",
      value: "dynamic-value",
    });

    const result = await node.tick(contextWithInput());

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("myKey")).toBe("dynamic-value");

    function contextWithInput(): TemporalContext {
      return context;
    }
  });

  it("should overwrite existing blackboard value", async () => {
    blackboard.set("counter", 1);

    const node = new SetVariable({
      id: "sv-10",
      key: "counter",
      value: 2,
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("counter")).toBe(2);
  });

  it("should set an array value", async () => {
    const node = new SetVariable({
      id: "sv-11",
      key: "items",
      value: ["a", "b", "c"],
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(blackboard.get("items")).toEqual(["a", "b", "c"]);
  });
});
