/**
 * Tests for provider-resolver.ts
 */

import { describe, it, expect, vi } from "vitest";
import { resolveModel } from "./provider-resolver.js";
import type { AIProviderConfig } from "./types.js";
import type { LanguageModel } from "ai";

describe("resolveModel", () => {
  const mockModel = { modelId: "test-model" } as unknown as LanguageModel;

  it("should resolve a configured provider by calling the function with modelId", () => {
    const anthropicFn = vi.fn().mockReturnValue(mockModel);
    const providers: AIProviderConfig = {
      anthropic: anthropicFn,
    };

    const result = resolveModel(providers, "anthropic", "claude-sonnet-4-20250514");

    expect(anthropicFn).toHaveBeenCalledWith("claude-sonnet-4-20250514");
    expect(result).toBe(mockModel);
  });

  it("should pass the model ID through correctly to the provider function", () => {
    const openaiModel = { modelId: "gpt-4o" } as unknown as LanguageModel;
    const openaiFn = vi.fn().mockReturnValue(openaiModel);
    const providers: AIProviderConfig = {
      openai: openaiFn,
    };

    const result = resolveModel(providers, "openai", "gpt-4o");

    expect(openaiFn).toHaveBeenCalledTimes(1);
    expect(openaiFn).toHaveBeenCalledWith("gpt-4o");
    expect(result).toBe(openaiModel);
  });

  it("should throw a descriptive error listing configured providers when provider is not configured", () => {
    const providers: AIProviderConfig = {
      anthropic: vi.fn(),
      openai: vi.fn(),
    };

    expect(() => resolveModel(providers, "google", "gemini-pro")).toThrow(
      'Provider "google" is not configured.'
    );
    expect(() => resolveModel(providers, "google", "gemini-pro")).toThrow(
      "Configured providers: [anthropic, openai]"
    );
    expect(() => resolveModel(providers, "google", "gemini-pro")).toThrow(
      "Pass it in createAIActivities({ providers: { google: ... } })"
    );
  });

  it("should show 'none' when no providers are configured", () => {
    const providers: AIProviderConfig = {};

    expect(() => resolveModel(providers, "anthropic", "test")).toThrow(
      "Configured providers: [none]"
    );
  });

  it("should not include providers set to undefined in the configured list", () => {
    const providers: AIProviderConfig = {
      anthropic: vi.fn(),
      openai: undefined,
    };

    expect(() => resolveModel(providers, "google", "test")).toThrow(
      "Configured providers: [anthropic]"
    );
  });

  it("should resolve different providers independently", () => {
    const anthropicModel = { modelId: "claude" } as unknown as LanguageModel;
    const openaiModel = { modelId: "gpt" } as unknown as LanguageModel;

    const providers: AIProviderConfig = {
      anthropic: vi.fn().mockReturnValue(anthropicModel),
      openai: vi.fn().mockReturnValue(openaiModel),
    };

    expect(resolveModel(providers, "anthropic", "claude-sonnet-4-20250514")).toBe(anthropicModel);
    expect(resolveModel(providers, "openai", "gpt-4")).toBe(openaiModel);
  });
});
