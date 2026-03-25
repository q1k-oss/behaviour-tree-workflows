import { z } from "zod";
import { createNodeSchema } from "../schemas/base.schema.js";

export const mathOpSchema = createNodeSchema("MathOp", {
  expression: z.string().min(1, "expression is required"),
  outputKey: z.string().min(1, "outputKey is required"),
  round: z.enum(["none", "round", "floor", "ceil"]).optional(),
  precision: z.number().int().nonnegative().optional(),
});

export type MathOpSchemaType = z.infer<typeof mathOpSchema>;
