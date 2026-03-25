import { z } from "zod";
import { createNodeSchema } from "../schemas/base.schema.js";

const transformMappingSchema = z.object({
  target: z.string().min(1, "target is required"),
  value: z.unknown(),
  coerce: z.enum(["string", "number", "boolean"]).optional(),
});

export const dataTransformSchema = createNodeSchema("DataTransform", {
  outputKey: z.string().min(1, "outputKey is required"),
  mappings: z.array(transformMappingSchema).min(1, "at least one mapping is required"),
  wrapInArray: z.boolean().optional(),
});

export type DataTransformSchemaType = z.infer<typeof dataTransformSchema>;
