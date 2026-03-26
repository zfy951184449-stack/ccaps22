import { z } from "zod";

export const apiHealthSchema = z.object({
  status: z.string(),
  message: z.string(),
});

export type ApiHealth = z.infer<typeof apiHealthSchema>;
