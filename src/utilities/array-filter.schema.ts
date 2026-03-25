import { z } from "zod";
import { createNodeSchema } from "../schemas/base.schema.js";

const filterConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum([
    "eq", "ne", "gt", "lt", "gte", "lte",
    "in", "nin", "exists", "regex", "between", "contains",
  ]),
  value: z.unknown().optional(),
  range: z.tuple([z.unknown(), z.unknown()]).optional(),
});

export const arrayFilterSchema = createNodeSchema("ArrayFilter", {
  input: z.string().min(1, "input is required"),
  outputKey: z.string().min(1, "outputKey is required"),
  conditions: z.array(filterConditionSchema).min(1, "at least one condition is required"),
  logic: z.enum(["and", "or"]).optional(),
});

export type ArrayFilterSchemaType = z.infer<typeof arrayFilterSchema>;
