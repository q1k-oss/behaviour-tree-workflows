/**
 * Tests for ToolRouter Node
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type TemporalContext,
  type AgentToolDefinition,
  NodeStatus,
  ScopedBlackboard,
} from "../index.js";
import { ToolRouter } from "./tool-router.js";

describe("ToolRouter", () => {
  let blackboard: ScopedBlackboard;
  let context: TemporalContext;

  const weatherTools: AgentToolDefinition[] = [
    { name: "get_weather", description: "Get weather", inputSchema: { type: "object" } },
  ];
  const mathTools: AgentToolDefinition[] = [
    { name: "calculate", description: "Calculate", inputSchema: { type: "object" } },
  ];
  const timeTools: AgentToolDefinition[] = [
    { name: "get_time", description: "Get time", inputSchema: { type: "object" } },
  ];

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    context = {
      blackboard,
      timestamp: Date.now(),
      deltaTime: 0,
    };
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("should include default tools when no rules match", async () => {
    blackboard.set("intent", "random text");

    const node = new ToolRouter({
      id: "tr-1",
      intentKey: "intent",
      toolSets: { weather: weatherTools, math: mathTools, time: timeTools },
      defaultTools: ["time"],
      rules: [
        { pattern: "weather", toolSets: ["weather"] },
      ],
      outputKey: "selectedTools",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    const tools = blackboard.get("selectedTools") as AgentToolDefinition[];
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("get_time");
  });

  it("should match rules and include matching tool sets", async () => {
    blackboard.set("intent", "What's the weather like?");

    const node = new ToolRouter({
      id: "tr-2",
      intentKey: "intent",
      toolSets: { weather: weatherTools, math: mathTools },
      rules: [
        { pattern: "weather|forecast", toolSets: ["weather"] },
        { pattern: "calc|math", toolSets: ["math"] },
      ],
      outputKey: "selectedTools",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    const tools = blackboard.get("selectedTools") as AgentToolDefinition[];
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("get_weather");
  });

  it("should combine defaults and matched rules", async () => {
    blackboard.set("intent", "Calculate something");

    const node = new ToolRouter({
      id: "tr-3",
      intentKey: "intent",
      toolSets: { weather: weatherTools, math: mathTools, time: timeTools },
      defaultTools: ["time"],
      rules: [
        { pattern: "calc|math", toolSets: ["math"] },
      ],
      outputKey: "selectedTools",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    const tools = blackboard.get("selectedTools") as AgentToolDefinition[];
    expect(tools).toHaveLength(2);
    const names = tools.map(t => t.name);
    expect(names).toContain("get_time");
    expect(names).toContain("calculate");
  });

  it("should handle multiple matching rules", async () => {
    blackboard.set("intent", "weather and math please");

    const node = new ToolRouter({
      id: "tr-4",
      intentKey: "intent",
      toolSets: { weather: weatherTools, math: mathTools, time: timeTools },
      rules: [
        { pattern: "weather", toolSets: ["weather"] },
        { pattern: "math", toolSets: ["math"] },
      ],
      outputKey: "selectedTools",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    const tools = blackboard.get("selectedTools") as AgentToolDefinition[];
    expect(tools).toHaveLength(2);
  });

  it("should deduplicate tools by name", async () => {
    blackboard.set("intent", "weather forecast");

    const node = new ToolRouter({
      id: "tr-5",
      intentKey: "intent",
      toolSets: {
        weather1: weatherTools,
        weather2: weatherTools, // Same tools, different set name
      },
      rules: [
        { pattern: "weather", toolSets: ["weather1", "weather2"] },
      ],
      outputKey: "selectedTools",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    const tools = blackboard.get("selectedTools") as AgentToolDefinition[];
    expect(tools).toHaveLength(1); // Deduplicated
  });

  it("should handle empty intent (no match, defaults only)", async () => {
    // Don't set intent

    const node = new ToolRouter({
      id: "tr-6",
      intentKey: "intent",
      toolSets: { weather: weatherTools, time: timeTools },
      defaultTools: ["time"],
      rules: [
        { pattern: "weather", toolSets: ["weather"] },
      ],
      outputKey: "selectedTools",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    const tools = blackboard.get("selectedTools") as AgentToolDefinition[];
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("get_time");
  });

  it("should return empty array when no defaults and no matches", async () => {
    blackboard.set("intent", "random");

    const node = new ToolRouter({
      id: "tr-7",
      intentKey: "intent",
      toolSets: { weather: weatherTools },
      rules: [
        { pattern: "weather", toolSets: ["weather"] },
      ],
      outputKey: "selectedTools",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    const tools = blackboard.get("selectedTools") as AgentToolDefinition[];
    expect(tools).toHaveLength(0);
  });

  describe("configuration validation", () => {
    it("should throw ConfigurationError when intentKey is missing", () => {
      expect(() => new ToolRouter({
        id: "bad",
        intentKey: "",
        toolSets: { t: weatherTools },
        outputKey: "out",
      })).toThrow("ToolRouter requires intentKey");
    });

    it("should throw ConfigurationError when toolSets is empty", () => {
      expect(() => new ToolRouter({
        id: "bad",
        intentKey: "intent",
        toolSets: {},
        outputKey: "out",
      })).toThrow("ToolRouter requires at least one toolSet");
    });

    it("should throw ConfigurationError when outputKey is missing", () => {
      expect(() => new ToolRouter({
        id: "bad",
        intentKey: "intent",
        toolSets: { t: weatherTools },
        outputKey: "",
      })).toThrow("ToolRouter requires outputKey");
    });
  });

  it("should handle non-string intent value gracefully", async () => {
    blackboard.set("intent", 42); // number, not string

    const node = new ToolRouter({
      id: "tr-nonstring",
      intentKey: "intent",
      toolSets: { weather: weatherTools },
      defaultTools: ["weather"],
      rules: [{ pattern: "weather", toolSets: ["weather"] }],
      outputKey: "selectedTools",
    });

    const result = await node.tick(context);

    // Should still succeed — non-string treated as empty string for matching
    expect(result).toBe(NodeStatus.SUCCESS);
    const tools = blackboard.get("selectedTools") as AgentToolDefinition[];
    // Only defaults, since 42 won't match "weather"
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("get_weather");
  });

  it("should handle rule referencing non-existent toolSet gracefully", async () => {
    blackboard.set("intent", "something");

    const node = new ToolRouter({
      id: "tr-bad-set",
      intentKey: "intent",
      toolSets: { weather: weatherTools },
      rules: [{ pattern: "something", toolSets: ["nonExistent"] }],
      outputKey: "selectedTools",
    });

    const result = await node.tick(context);

    // Should succeed but with 0 tools (nonExistent set doesn't exist)
    expect(result).toBe(NodeStatus.SUCCESS);
    const tools = blackboard.get("selectedTools") as AgentToolDefinition[];
    expect(tools).toHaveLength(0);
  });

  it("should be case insensitive in pattern matching", async () => {
    blackboard.set("intent", "WEATHER FORECAST");

    const node = new ToolRouter({
      id: "tr-8",
      intentKey: "intent",
      toolSets: { weather: weatherTools },
      rules: [
        { pattern: "weather", toolSets: ["weather"] },
      ],
      outputKey: "selectedTools",
    });

    const result = await node.tick(context);

    expect(result).toBe(NodeStatus.SUCCESS);
    const tools = blackboard.get("selectedTools") as AgentToolDefinition[];
    expect(tools).toHaveLength(1);
  });
});
