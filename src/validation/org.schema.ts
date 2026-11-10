import { z } from "zod";

export const createOrgSchema = z.object({
  name: z
    .string({ error: "name is required" })
    .trim()
    .min(1, "name must be at least 1 character")
    .max(100, "name cannot exceed 100 characters"),
});

export const updateOrgSchema = z.object({
  name: z
    .string({ error: "name is required" })
    .trim()
    .min(1, "name must be at least 1 character")
    .max(100, "name cannot exceed 100 characters"),
});

export const transferOwnershipSchema = z.object({
  userId: z
    .number({ error: "userId is required as a number" })
    .int("userId must be an integer")
    .positive("userId must be positive"),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["admin", "member"], {
    error: "role must be either 'admin' or 'member'",
  }),
});

export const listMembersQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
