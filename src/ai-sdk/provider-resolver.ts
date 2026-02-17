/**
 * Resolves LLMProvider string + model ID to an AI SDK LanguageModel instance
 */

import type { LanguageModel } from "ai";
import type { LLMProvider } from "../types.js";
import type { AIProviderConfig } from "./types.js";

/**
 * Resolve a provider name and model ID to an AI SDK LanguageModel.
 * Throws a descriptive error if the provider is not configured.
 */
export function resolveModel(
  providers: AIProviderConfig,
  provider: LLMProvider,
  modelId: string,
): LanguageModel {
  const providerFn = providers[provider];
  if (!providerFn) {
    const configured = Object.keys(providers).filter(
      (k) => providers[k as keyof AIProviderConfig] != null,
    );
    throw new Error(
      `Provider "${provider}" is not configured. ` +
        `Configured providers: [${configured.join(", ") || "none"}]. ` +
        `Pass it in createAIActivities({ providers: { ${provider}: ... } })`,
    );
  }
  return providerFn(modelId);
}
