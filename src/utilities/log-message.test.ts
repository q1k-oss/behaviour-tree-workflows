/**
 * Tests for LogMessage Node
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NodeEventEmitter, NodeEventType } from "../events.js";
import {
  type TemporalContext,
  NodeStatus,
  ScopedBlackboard,
} from "../index.js";
import { LogMessage } from "./log-message.js";

describe("LogMessage", () => {
  let blackboard: ScopedBlackboard;
  let context: TemporalContext;
  let consoleLogSpy: unknown;
  let consoleWarnSpy: unknown;
  let consoleErrorSpy: unknown;
  let consoleDebugSpy: unknown;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    context = {
      blackboard: blackboard,
      timestamp: Date.now(),
      deltaTime: 0,
    };

    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  it("should log a simple message", async () => {
    const node = new LogMessage({
      id: "log-1",
      message: "Test message",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("[LogMessage:log-1] Test message"),
    );
  });

  it("should log message with blackboard value placeholder", async () => {
    blackboard.set("username", "testuser");
    blackboard.set("count", 42);

    const node = new LogMessage({
      id: "log-2",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is intentional - LogMessage processes ${} syntax
      message: "User: ${username}, Count: ${count}",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("[LogMessage:log-2] User: testuser, Count: 42"),
    );
  });

  it("should handle missing blackboard values", async () => {
    const node = new LogMessage({
      id: "log-3",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is intentional - LogMessage processes ${} syntax
      message: "Value: ${missingKey}",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    // Should keep the placeholder if value is missing
    expect(consoleLogSpy).toHaveBeenCalledWith(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is intentional - testing placeholder syntax
      expect.stringContaining("[LogMessage:log-3] Value: ${missingKey}"),
    );
  });

  it("should handle null values", async () => {
    blackboard.set("nullValue", null);

    const node = new LogMessage({
      id: "log-4",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is intentional - LogMessage processes ${} syntax
      message: "Null value: ${nullValue}",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("[LogMessage:log-4] Null value: null"),
    );
  });

  it("should handle object values", async () => {
    blackboard.set("user", { name: "John", age: 30 });

    const node = new LogMessage({
      id: "log-5",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is intentional - LogMessage processes ${} syntax
      message: "User: ${user}",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[LogMessage:log-5] User: {"age":30,"name":"John"}',
      ),
    );
  });

  it("should log with warn level", async () => {
    const node = new LogMessage({
      id: "log-6",
      message: "Warning message",
      level: "warn",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it("should log with error level", async () => {
    const node = new LogMessage({
      id: "log-7",
      message: "Error message",
      level: "error",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it("should log with debug level", async () => {
    const node = new LogMessage({
      id: "log-8",
      message: "Debug message",
      level: "debug",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(consoleDebugSpy).toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it("should default to info level", async () => {
    const node = new LogMessage({
      id: "log-9",
      message: "Info message",
      // level not specified
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it("should handle multiple placeholders", async () => {
    blackboard.set("name", "Alice");
    blackboard.set("age", 25);
    blackboard.set("city", "New York");

    const node = new LogMessage({
      id: "log-10",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is intentional - LogMessage processes ${} syntax
      message: "${name} is ${age} years old and lives in ${city}",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "[LogMessage:log-10] Alice is 25 years old and lives in New York",
      ),
    );
  });

  it("should handle array values", async () => {
    blackboard.set("items", ["apple", "banana", "cherry"]);

    const node = new LogMessage({
      id: "log-11",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is intentional - LogMessage processes ${} syntax
      message: "Items: ${items}",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[LogMessage:log-11] Items: ["apple","banana","cherry"]',
      ),
    );
  });

  describe("LOG event emission", () => {
    it("should emit LOG event when executed with event emitter", async () => {
      const eventEmitter = new NodeEventEmitter();
      const receivedEvents: unknown[] = [];

      eventEmitter.on(NodeEventType.LOG, (event) => {
        receivedEvents.push(event);
      });

      const contextWithEmitter: TemporalContext = {
        ...context,
        eventEmitter,
      };

      const node = new LogMessage({
        id: "log-event",
        name: "EventTest",
        message: "Event test message",
        level: "warn",
      });

      await node.tick(contextWithEmitter);

      expect(receivedEvents).toHaveLength(1);
      const event = receivedEvents[0] as {
        type: string;
        nodeId: string;
        data: { level: string; message: string };
      };
      expect(event.type).toBe(NodeEventType.LOG);
      expect(event.nodeId).toBe("log-event");
      expect(event.data.level).toBe("warn");
      expect(event.data.message).toBe("Event test message");
    });

    it("should not fail when no event emitter present", async () => {
      const node = new LogMessage({
        id: "log-no-emitter",
        message: "No emitter test",
      });

      // Context without eventEmitter
      const result = await node.tick(context);

      expect(result).toBe(NodeStatus.SUCCESS);
    });
  });
});
