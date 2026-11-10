import { z } from "zod";

export const createCommentSchema = z.object({
  body: z
    .string({ error: "body is required" })
    .trim()
    .min(1, "body must be at least 1 character")
    .max(1000, "body cannot exceed 1000 characters"),
  mentions: z.array(z.number().int().positive()).optional(),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
