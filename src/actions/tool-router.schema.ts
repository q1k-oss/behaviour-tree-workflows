/**
 * Zod schema for ToolRouter node configuration
 */

import { z } from "zod";
import { createNodeSchema } from "../schemas/base.schema.js";

const toolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.record(z.string(), z.unknown()),
});

const ruleSchema = z.object({
  pattern: z.string().min(1),
  toolSets: z.array(z.string().min(1)).min(1),
});

export const toolRouterSchema = createNodeSchema("ToolRouter", {
  intentKey: z.string().min(1, "intentKey is required"),
  toolSets: z.record(z.string(), z.array(toolDefinitionSchema)),
  defaultTools: z.array(z.string()).optional(),
  rules: z.array(ruleSchema).optional(),
  outputKey: z.string().min(1, "outputKey is required"),
});

export type ToolRouterSchemaType = z.infer<typeof toolRouterSchema>;
