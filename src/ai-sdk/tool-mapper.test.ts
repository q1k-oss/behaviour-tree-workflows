/**
 * Tests for tool-mapper.ts
 *
 * Tests mapToolDefinitions() — converts library tool definitions
 * to AI SDK tool format using jsonSchema().
 */

import { describe, it, expect } from "vitest";
import { mapToolDefinitions } from "./tool-mapper.js";
import type { AgentToolDefinition } from "../types.js";

describe("mapToolDefinitions", () => {
  it("should map a single tool definition", () => {
    const tools: AgentToolDefinition[] = [
      {
        name: "get_weather",
        description: "Get weather for a city",
        inputSchema: {
          type: "object",
          properties: {
            city: { type: "string" },
          },
          required: ["city"],
        },
      },
    ];

    const result = mapToolDefinitions(tools);

    expect(Object.keys(result)).toHaveLength(1);
    expect(result["get_weather"]).toBeDefined();
    // AI SDK tool() returns an object with description and parameters
    expect(result["get_weather"].description).toBe("Get weather for a city");
  });

  it("should map multiple tool definitions", () => {
    const tools: AgentToolDefinition[] = [
      {
        name: "get_weather",
        description: "Get weather",
        inputSchema: { type: "object", properties: { city: { type: "string" } } },
      },
      {
        name: "search",
        description: "Search the web",
        inputSchema: { type: "object", properties: { query: { type: "string" } } },
      },
      {
        name: "calculate",
        description: "Do math",
        inputSchema: { type: "object", properties: { expression: { type: "string" } } },
      },
    ];

    const result = mapToolDefinitions(tools);

    expect(Object.keys(result)).toHaveLength(3);
    expect(result["get_weather"]).toBeDefined();
    expect(result["search"]).toBeDefined();
    expect(result["calculate"]).toBeDefined();
  });

  it("should return empty object for empty tools array", () => {
    const result = mapToolDefinitions([]);
    expect(result).toEqual({});
  });

  it("should preserve tool name and description", () => {
    const tools: AgentToolDefinition[] = [
      {
        name: "my_tool",
        description: "A very detailed description of what this tool does",
        inputSchema: { type: "object" },
      },
    ];

    const result = mapToolDefinitions(tools);

    expect(result["my_tool"]).toBeDefined();
    expect(result["my_tool"].description).toBe(
      "A very detailed description of what this tool does"
    );
  });

  it("should use jsonSchema() for inputSchema", () => {
    const tools: AgentToolDefinition[] = [
      {
        name: "structured_tool",
        description: "Tool with complex schema",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "The name" },
            count: { type: "number" },
            tags: { type: "array", items: { type: "string" } },
          },
          required: ["name"],
        },
      },
    ];

    const result = mapToolDefinitions(tools);

    // AI SDK v6 tool() returns an object with inputSchema (wrapping jsonSchema)
    expect(result["structured_tool"]).toBeDefined();
    expect(result["structured_tool"].inputSchema).toBeDefined();
    // The inputSchema should contain the original JSON schema properties
    const schema = result["structured_tool"].inputSchema as { jsonSchema: Record<string, unknown> };
    expect(schema.jsonSchema).toBeDefined();
    expect((schema.jsonSchema as Record<string, unknown>).type).toBe("object");
  });

  it("should create tools without an execute function", () => {
    const tools: AgentToolDefinition[] = [
      {
        name: "no_execute",
        description: "Tool without execute",
        inputSchema: { type: "object" },
      },
    ];

    const result = mapToolDefinitions(tools);

    // AI SDK tools created without execute should not have the execute property
    expect(result["no_execute"].execute).toBeUndefined();
  });
});
