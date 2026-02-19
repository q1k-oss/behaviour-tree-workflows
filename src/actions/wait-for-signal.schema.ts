/**
 * Zod schema for WaitForSignal node configuration
 */

import { z } from "zod";
import { createNodeSchema } from "../schemas/base.schema.js";

export const waitForSignalSchema = createNodeSchema("WaitForSignal", {
  signalName: z.string().min(1, "signalName is required"),
  signalKey: z.string().optional(),
  timeoutMs: z.number().int().positive().optional().default(86400000),
  outputKey: z.string().min(1, "outputKey is required"),
});

export type WaitForSignalSchemaType = z.infer<typeof waitForSignalSchema>;
