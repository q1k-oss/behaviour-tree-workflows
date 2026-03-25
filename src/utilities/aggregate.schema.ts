import { z } from "zod";
import { createNodeSchema } from "../schemas/base.schema.js";

const aggregateOperationSchema = z.object({
  type: z.enum(["count", "sum", "avg", "min", "max"]),
  field: z.string().optional(),
  as: z.string().optional(),
});

export const aggregateSchema = createNodeSchema("Aggregate", {
  input: z.string().min(1, "input is required"),
  outputKey: z.string().min(1, "outputKey is required"),
  operations: z.array(aggregateOperationSchema).min(1, "at least one operation is required"),
  groupBy: z.string().optional(),
});

export type AggregateSchemaType = z.infer<typeof aggregateSchema>;
