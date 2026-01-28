/**
 * Zod schema for CodeExecution node validation
 */

import { z } from "zod";
import { createNodeSchema } from "../schemas/base.schema.js";

/**
 * Schema for CodeExecution node props
 */
export const codeExecutionSchema = createNodeSchema("CodeExecution", {
  /** Code to execute */
  code: z.string().min(1, "Code is required"),

  /** Programming language */
  language: z.enum(["javascript", "python"], {
    message: "Language must be 'javascript' or 'python'",
  }),

  /** Execution timeout in milliseconds */
  timeout: z.number().int().positive().optional().default(30000),

  /** Python packages to install before execution */
  packages: z.array(z.string()).optional().default([]),
});

export type CodeExecutionSchemaType = z.infer<typeof codeExecutionSchema>;
