import { z } from "zod";

export const signupSchema = z.object({
  name: z
    .string({ error: "name is required" })
    .trim()
    .min(1, "name must be at least 1 character")
    .max(100, "name cannot exceed 100 characters"),
  email: z
    .string({ error: "email is required" })
    .trim()
    .email("email must be a valid email address"),
  password: z
    .string({ error: "password is required" })
    .min(8, "password must be at least 8 characters"),
  role: z.enum(["contributor", "maintainer", "client"]).optional(),
  inviteToken: z.string().trim().optional(),
});

export const loginSchema = z.object({
  email: z
    .string({ error: "email is required" })
    .trim()
    .email("email must be a valid email address"),
  password: z
    .string({ error: "password is required" })
    .min(1, "password is required"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
