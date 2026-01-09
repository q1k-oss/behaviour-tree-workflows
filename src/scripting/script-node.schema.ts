/**
 * Schema for Script node configuration
 * Validates code and timeout properties
 */

import { z } from "zod";
import { createNodeSchema, validations } from "../schemas/base.schema.js";

/**
 * Script node configuration schema
 * Validates:
 * - code: non-empty string (required)
 * - timeout: positive number in milliseconds (optional)
 */
export const scriptConfigurationSchema = createNodeSchema("Script", {
  code: z.string().min(1, "Script code cannot be empty"),
  timeout: validations.positiveNumber("timeout").optional(),
});

export type ValidatedScriptConfiguration = z.infer<
  typeof scriptConfigurationSchema
>;
