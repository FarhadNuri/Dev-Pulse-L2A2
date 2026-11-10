import { z } from "zod";

export const updateOrgStatusSchema = z.object({
  status: z.enum(["active", "suspended"], {
    error: "status must be 'active' or 'suspended'",
  }),
});

export const deleteOrgSchema = z.object({
  confirm_name: z.string({ error: "confirm_name is required" }).min(1, "confirm_name cannot be empty"),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(["active", "disabled"], {
    error: "status must be 'active' or 'disabled'",
  }),
});

export const updateSuperAdminSchema = z.object({
  value: z.boolean({ error: "value must be a boolean" }),
});

export const adminOrgsQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(["active", "suspended", "all"]).optional(),
  active_recent_days: z.coerce.number().int().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminUsersQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(["active", "disabled", "all"]).optional(),
  recent_days: z.coerce.number().int().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type UpdateOrgStatusInput = z.infer<typeof updateOrgStatusSchema>;
export type DeleteOrgInput = z.infer<typeof deleteOrgSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type UpdateSuperAdminInput = z.infer<typeof updateSuperAdminSchema>;
export type AdminOrgsQueryInput = z.infer<typeof adminOrgsQuerySchema>;
export type AdminUsersQueryInput = z.infer<typeof adminUsersQuerySchema>;

