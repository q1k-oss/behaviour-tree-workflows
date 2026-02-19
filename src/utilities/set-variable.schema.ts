/**
 * Zod schema for SetVariable node configuration
 */

import { z } from "zod";
import { createNodeSchema } from "../schemas/base.schema.js";

export const setVariableSchema = createNodeSchema("SetVariable", {
  key: z.string().min(1, "key is required"),
  value: z.unknown(),
});

export type SetVariableSchemaType = z.infer<typeof setVariableSchema>;
