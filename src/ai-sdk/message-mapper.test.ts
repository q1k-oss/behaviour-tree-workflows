/**
 * Tests for message-mapper.ts
 *
 * Tests mapLLMMessages() and mapAgentMessages() — the translation layer
 * between library message types and AI SDK's ModelMessage format.
 */

import { describe, it, expect } from "vitest";
import { mapLLMMessages, mapAgentMessages } from "./message-mapper.js";
import type { LLMMessage, AgentMessage } from "../types.js";

describe("mapLLMMessages", () => {
  it("should map simple LLM messages with system prompt", () => {
    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];

    const result = mapLLMMessages(messages, "You are a helpful assistant.");

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ role: "system", content: "You are a helpful assistant." });
    expect(result[1]).toEqual({ role: "user", content: "Hello" });
    expect(result[2]).toEqual({ role: "assistant", content: "Hi there!" });
  });

  it("should map simple LLM messages without system prompt", () => {
    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    const result = mapLLMMessages(messages);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: "user", content: "Hello" });
  });

  it("should deduplicate system messages when systemPrompt is provided", () => {
    const messages: LLMMessage[] = [
      { role: "system", content: "Old system prompt" },
      { role: "user", content: "Hello" },
    ];

    const result = mapLLMMessages(messages, "New system prompt");

    // The system message from messages should be skipped since systemPrompt is provided
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: "system", content: "New system prompt" });
    expect(result[1]).toEqual({ role: "user", content: "Hello" });
  });

  it("should keep system message from array when no systemPrompt is provided", () => {
    const messages: LLMMessage[] = [
      { role: "system", content: "System from array" },
      { role: "user", content: "Hello" },
    ];

    const result = mapLLMMessages(messages);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: "system", content: "System from array" });
    expect(result[1]).toEqual({ role: "user", content: "Hello" });
  });

  it("should handle empty messages array", () => {
    const result = mapLLMMessages([]);
    expect(result).toHaveLength(0);
  });

  it("should handle empty messages array with system prompt", () => {
    const result = mapLLMMessages([], "system prompt");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: "system", content: "system prompt" });
  });
});

describe("mapAgentMessages", () => {
  it("should map agent message with plain string content", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ];

    const result = mapAgentMessages(messages);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: "user", content: "Hello" });
    expect(result[1]).toEqual({ role: "assistant", content: "Hi!" });
  });

  it("should map assistant message with tool_use blocks to AI SDK tool-call parts", () => {
    const messages: AgentMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check" },
          {
            type: "tool_use",
            id: "tc_1",
            name: "get_weather",
            input: { city: "SF" },
          },
        ],
      },
    ];

    const result = mapAgentMessages(messages);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");

    const content = result[0].content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: "text", text: "Let me check" });
    expect(content[1]).toEqual({
      type: "tool-call",
      toolCallId: "tc_1",
      toolName: "get_weather",
      input: { city: "SF" },
    });
  });

  it("should map user message with tool_result blocks to AI SDK tool role with output format", () => {
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tc_1",
            content: '{"temp": "72F"}',
            is_error: false,
          },
        ],
      },
    ];

    const result = mapAgentMessages(messages);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("tool");

    const content = result[0].content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({
      type: "tool-result",
      toolCallId: "tc_1",
      toolName: "tc_1", // Uses toolCallId as fallback for toolName
      output: { type: "text", value: '{"temp": "72F"}' },
    });
  });

  it("should map tool_result with is_error=true to error-text output type", () => {
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tc_2",
            content: "Tool not found",
            is_error: true,
          },
        ],
      },
    ];

    const result = mapAgentMessages(messages);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("tool");

    const content = result[0].content as Array<Record<string, unknown>>;
    expect(content[0]).toEqual({
      type: "tool-result",
      toolCallId: "tc_2",
      toolName: "tc_2",
      output: { type: "error-text", value: "Tool not found" },
    });
  });

  it("should handle mixed text + tool_use in assistant message", () => {
    const messages: AgentMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "I'll do two things." },
          {
            type: "tool_use",
            id: "tc_1",
            name: "get_weather",
            input: { city: "SF" },
          },
          {
            type: "tool_use",
            id: "tc_2",
            name: "get_time",
            input: { timezone: "PST" },
          },
        ],
      },
    ];

    const result = mapAgentMessages(messages);

    expect(result).toHaveLength(1);
    const content = result[0].content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(3);
    expect(content[0]).toEqual({ type: "text", text: "I'll do two things." });
    expect(content[1].type).toBe("tool-call");
    expect(content[1].toolName).toBe("get_weather");
    expect(content[2].type).toBe("tool-call");
    expect(content[2].toolName).toBe("get_time");
  });

  it("should handle empty messages array", () => {
    const result = mapAgentMessages([]);
    expect(result).toHaveLength(0);
  });

  it("should handle empty messages array with system prompt", () => {
    const result = mapAgentMessages([], "Be helpful");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: "system", content: "Be helpful" });
  });

  it("should add system message from AgentMessage array when no explicit systemPrompt", () => {
    const messages: AgentMessage[] = [
      { role: "system", content: "You are a bot." },
      { role: "user", content: "Hi" },
    ];

    const result = mapAgentMessages(messages);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: "system", content: "You are a bot." });
    expect(result[1]).toEqual({ role: "user", content: "Hi" });
  });

  it("should skip system message in array when explicit systemPrompt is provided", () => {
    const messages: AgentMessage[] = [
      { role: "system", content: "Old system prompt" },
      { role: "user", content: "Hi" },
    ];

    const result = mapAgentMessages(messages, "New system prompt");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: "system", content: "New system prompt" });
    expect(result[1]).toEqual({ role: "user", content: "Hi" });
  });

  it("should handle user message with text blocks (no tool_result)", () => {
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "First part" },
          { type: "text", text: "Second part" },
        ],
      },
    ];

    const result = mapAgentMessages(messages);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
    // Text blocks joined with newline
    expect(result[0].content).toBe("First part\nSecond part");
  });

  it("should handle multiple tool_result blocks in a single user message", () => {
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tc_1",
            content: "Result 1",
          },
          {
            type: "tool_result",
            tool_use_id: "tc_2",
            content: "Result 2",
          },
        ],
      },
    ];

    const result = mapAgentMessages(messages);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("tool");

    const content = result[0].content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(2);
    expect(content[0].toolCallId).toBe("tc_1");
    expect(content[1].toolCallId).toBe("tc_2");
  });

  it("should handle assistant message with only tool_use blocks (no text)", () => {
    const messages: AgentMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tc_1",
            name: "search",
            input: { query: "test" },
          },
        ],
      },
    ];

    const result = mapAgentMessages(messages);

    expect(result).toHaveLength(1);
    const content = result[0].content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("tool-call");
  });

  it("should handle a full multi-turn conversation", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "What's the weather?" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check." },
          { type: "tool_use", id: "tc_1", name: "get_weather", input: { city: "SF" } },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tc_1", content: "72F sunny" },
        ],
      },
      { role: "assistant", content: "It's 72F and sunny in SF!" },
    ];

    const result = mapAgentMessages(messages);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ role: "user", content: "What's the weather?" });
    expect(result[1].role).toBe("assistant");
    expect(result[2].role).toBe("tool");
    expect(result[3]).toEqual({ role: "assistant", content: "It's 72F and sunny in SF!" });
  });
});
