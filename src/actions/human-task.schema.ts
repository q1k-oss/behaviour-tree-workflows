/**
 * Zod schema for HumanTask node configuration
 * Validates YAML/JSON configuration for human-in-the-loop tasks
 */

import { z } from "zod";
import { createNodeSchema } from "../schemas/base.schema.js";

/**
 * Schema for a single A2UI component
 */
const a2uiComponentSchema = z.object({
  id: z.string().min(1, "Component ID cannot be empty"),
  component: z.record(z.string(), z.unknown()),
  weight: z.number().optional(),
});

/**
 * HumanTask node configuration schema
 *
 * @example YAML
 * ```yaml
 * type: HumanTask
 * id: expense-approval
 * props:
 *   title: "Expense Approval"
 *   assignee: "${input.managerEmail}"
 *   a2ui:
 *     components:
 *       - id: root
 *         component:
 *           Column:
 *             children:
 *               explicitList: [header, actions]
 *     dataBindings:
 *       /title: "Expense from ${input.employeeName}"
 *   timeoutMs: 86400000
 *   outputKey: approval
 * ```
 */
export const humanTaskSchema = createNodeSchema("HumanTask", {
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  assignee: z.string().optional(),
  assigneeRole: z.string().optional(),
  a2ui: z.object({
    components: z
      .array(a2uiComponentSchema)
      .min(1, "At least one A2UI component is required"),
    dataBindings: z.record(z.string(), z.string()).optional(),
  }),
  timeoutMs: z.number().int().positive().optional().default(86400000),
  onTimeout: z
    .enum(["expire", "approve", "reject"])
    .optional()
    .default("expire"),
  outputKey: z.string().optional(),
});

export type HumanTaskSchemaType = z.infer<typeof humanTaskSchema>;
