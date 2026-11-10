import { z } from "zod";

const hexColorRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const createLabelSchema = z.object({
  name: z
    .string({ error: "name is required" })
    .trim()
    .min(1, "name must be at least 1 character")
    .max(50, "name cannot exceed 50 characters"),
  color: z
    .string({ error: "color is required" })
    .trim()
    .regex(hexColorRegex, "color must be a valid hex code (e.g. #3b82f6)"),
});

export const updateLabelSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "name must be at least 1 character")
      .max(50, "name cannot exceed 50 characters")
      .optional(),
    color: z
      .string()
      .trim()
      .regex(hexColorRegex, "color must be a valid hex code (e.g. #3b82f6)")
      .optional(),
  })
  .refine(
    (data) => data.name !== undefined || data.color !== undefined,
    {
      message: "At least one field (name or color) must be provided for update",
    }
  );

export type CreateLabelInput = z.infer<typeof createLabelSchema>;
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;

