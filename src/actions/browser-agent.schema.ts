/**
 * Zod schema for BrowserAgent node configuration
 * Validates YAML/JSON configuration for autonomous browser agent
 */

import { z } from "zod";
import { createNodeSchema } from "../schemas/base.schema.js";

/**
 * BrowserAgent node configuration schema
 *
 * @example YAML - Basic Usage
 * ```yaml
 * type: BrowserAgent
 * id: search
 * props:
 *   goal: "Search for weather in NYC"
 *   startUrl: "https://google.com"
 *   outputKey: result
 * ```
 *
 * @example YAML - Multi-Step with Context
 * ```yaml
 * type: BrowserAgent
 * id: login
 * props:
 *   goal: "Login with username ${input.user} and password ${input.pass}"
 *   startUrl: "${input.loginUrl}"
 *   contextKey: browserContext
 *   persistContext: true
 *   timeout: 60000
 *   maxSteps: 10
 *   outputKey: loginResult
 * ```
 */
export const browserAgentSchema = createNodeSchema("BrowserAgent", {
  goal: z.string().min(1, "Goal is required"),
  startUrl: z.string().optional(),
  contextKey: z.string().optional(),
  persistContext: z.boolean().optional().default(false),
  timeout: z.number().int().positive().optional().default(60000),
  maxSteps: z.number().int().positive().optional().default(20),
  llmProvider: z
    .enum(["anthropic", "openai", "google", "ollama"])
    .optional(),
  llmModel: z.string().optional(),
  outputKey: z.string().min(1, "outputKey is required"),
});

export type BrowserAgentSchemaType = z.infer<typeof browserAgentSchema>;
