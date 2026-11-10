import { z } from "zod";

export const createOrgInviteSchema = z.object({
  email: z
    .string({ error: "email is required" })
    .trim()
    .email("email must be a valid email address"),
  role: z.enum(["member", "admin"], {
    error: "role must be either 'member' or 'admin'",
  }),
});

export const createClientInviteSchema = z.object({
  email: z
    .string({ error: "email is required" })
    .trim()
    .email("email must be a valid email address"),
});

export const listInvitationsQuerySchema = z.object({
  status: z.enum(["pending", "accepted", "revoked", "expired"]).optional().default("pending"),
});

