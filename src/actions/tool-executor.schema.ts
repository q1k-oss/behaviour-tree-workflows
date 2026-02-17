/**
 * Zod schema for ToolExecutor node configuration
 */

import { z } from "zod";
import { createNodeSchema } from "../schemas/base.schema.js";

export const toolExecutorSchema = createNodeSchema("ToolExecutor", {
  responseKey: z.string().min(1, "responseKey is required"),
  messagesKey: z.string().min(1, "messagesKey is required"),
  outputKey: z.string().optional(),
});

export type ToolExecutorSchemaType = z.infer<typeof toolExecutorSchema>;
