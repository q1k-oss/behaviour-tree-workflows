/**
 * Zod schema for StreamingSink decorator configuration
 */

import { z } from "zod";
import { createNodeSchema } from "../schemas/base.schema.js";

export const streamingSinkSchema = createNodeSchema("StreamingSink", {
  channelId: z.string().optional(),
  channelKey: z.string().optional(),
}).refine(
  (data) => data.channelId || data.channelKey,
  { message: "Either channelId or channelKey must be provided" }
);

export type StreamingSinkSchemaType = z.infer<typeof streamingSinkSchema>;
