/**
 * Zod schema for WaitForApproval node configuration
 * Validates YAML props before node instantiation
 */

import { z } from "zod";
import { createNodeSchema } from "./base.schema.js";

/**
 * WaitForApproval node schema
 *
 * Validates:
 * - approverEmail: valid email format
 * - title: required, non-empty string
 * - timeoutMs: positive number (defaults to 24 hours)
 * - onTimeout: enum of 'approve' or 'reject' (defaults to 'reject')
 */
export const waitForApprovalSchema = createNodeSchema("WaitForApproval", {
  approverEmail: z.string().email("Must be a valid email address"),
  approverRole: z.string().optional(),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  timeoutMs: z.number().positive("timeoutMs must be positive").optional().default(86400000),
  onTimeout: z.enum(["approve", "reject"]).optional().default("reject"),
});

/**
 * Type inference for schema
 */
export type WaitForApprovalSchemaType = z.infer<typeof waitForApprovalSchema>;
