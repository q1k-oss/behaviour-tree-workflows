import { z } from "zod";
import { createNodeSchema } from "../schemas/base.schema.js";

const thresholdLevelSchema = z.object({
  operator: z.enum(["lte", "lt", "gte", "gt", "eq", "ne", "between"]),
  value: z.unknown().optional(),
  range: z.tuple([z.unknown(), z.unknown()]).optional(),
  label: z.string().min(1, "label is required"),
});

export const thresholdCheckSchema = createNodeSchema("ThresholdCheck", {
  value: z.unknown(),
  thresholds: z.array(thresholdLevelSchema).min(1, "at least one threshold is required"),
  outputKey: z.string().optional(),
  failOn: z.array(z.string()).optional(),
});

export type ThresholdCheckSchemaType = z.infer<typeof thresholdCheckSchema>;
