/**
 * Zod schema for ClaudeAgent node configuration
 * Validates YAML/JSON configuration for autonomous Claude agent execution
 */

import { z } from "zod";
import { createNodeSchema } from "../schemas/base.schema.js";

/**
 * Schema for MCP server configuration (stdio, sse, or http)
 */
const mcpServerConfigSchema = z.union([
  z.object({
    type: z.literal("stdio").optional(),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    type: z.literal("sse"),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    type: z.literal("http"),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
]);

/**
 * Schema for subagent definition
 */
const subagentSchema = z.object({
  description: z.string().min(1, "Subagent description is required"),
  prompt: z.string().min(1, "Subagent prompt is required"),
  tools: z.array(z.string()).optional(),
  model: z.enum(["sonnet", "opus", "haiku", "inherit"]).optional(),
});

/**
 * ClaudeAgent node configuration schema
 *
 * @example YAML - Basic Usage
 * ```yaml
 * type: ClaudeAgent
 * id: implement-feature
 * props:
 *   prompt: "Add unit tests for the auth module"
 *   allowedTools: [Read, Write, Edit, Bash, Glob, Grep]
 *   permissionMode: acceptEdits
 *   outputKey: agentResult
 * ```
 *
 * @example YAML - With Subagents and MCP
 * ```yaml
 * type: ClaudeAgent
 * id: review-and-fix
 * props:
 *   prompt: "${bb.taskDescription}"
 *   model: claude-sonnet-4-5-20250929
 *   systemPrompt: "You are a senior developer."
 *   maxTurns: 50
 *   maxBudgetUsd: 5.0
 *   agents:
 *     code-reviewer:
 *       description: "Reviews code for quality"
 *       prompt: "Analyze code and suggest improvements"
 *       tools: [Read, Glob, Grep]
 *   outputKey: agentResult
 * ```
 */
export const claudeAgentSchema = createNodeSchema("ClaudeAgent", {
  prompt: z.string().min(1, "Prompt is required"),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  permissionMode: z
    .enum(["default", "acceptEdits", "bypassPermissions"])
    .optional()
    .default("default"),
  maxTurns: z.number().int().positive().optional().default(50),
  maxBudgetUsd: z.number().positive().optional(),
  cwd: z.string().optional(),
  mcpServers: z.record(z.string(), mcpServerConfigSchema).optional(),
  agents: z.record(z.string(), subagentSchema).optional(),
  outputKey: z.string().min(1, "outputKey is required"),
});

export type ClaudeAgentSchemaType = z.infer<typeof claudeAgentSchema>;
