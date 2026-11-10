import { z } from "zod";

export const createProjectSchema = z.object({
  name: z
    .string({ error: "name is required" })
    .trim()
    .min(1, "name must be at least 1 character")
    .max(100, "name cannot exceed 100 characters"),
  description: z
    .string()
    .trim()
    .max(5000, "description cannot exceed 5000 characters")
    .optional(),
});

export const updateProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "name must be at least 1 character")
    .max(100, "name cannot exceed 100 characters")
    .optional(),
  description: z
    .string()
    .trim()
    .max(5000, "description cannot exceed 5000 characters")
    .optional(),
});

export const decideAccessRequestSchema = z.object({
  action: z.enum(["approve", "reject", "approved", "rejected"], {
    error: "action must be 'approve' or 'reject'",
  }),
});

export const addProjectMemberSchema = z
  .object({
    userId: z
      .number()
      .int("userId must be an integer")
      .positive("userId must be positive")
      .optional(),
    email: z.string().email("Valid email is required").optional(),
    role: z.enum(["contributor", "client"]).optional().default("contributor"),
  })
  .refine((data) => data.userId !== undefined || data.email !== undefined, {
    message: "Either email or userId must be provided",
  });
