import { z } from "zod";

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const signAttachmentSchema = z.object({
  file_name: z.string().min(1, "file_name is required"),
  mime_type: z.enum(ALLOWED_MIME_TYPES, {
    error: "mime_type must be image/png, image/jpeg, or image/webp",
  }),
  size_bytes: z
    .number()
    .int()
    .positive("size_bytes must be positive")
    .max(MAX_SIZE_BYTES, "size_bytes cannot exceed 5 MB"),
});

export const registerAttachmentSchema = z.object({
  url: z.string().url("Valid URL is required"),
  public_id: z.string().min(1, "public_id is required"),
  file_name: z.string().min(1, "file_name is required"),
  mime_type: z.enum(ALLOWED_MIME_TYPES, {
    error: "mime_type must be image/png, image/jpeg, or image/webp",
  }),
  size_bytes: z
    .number()
    .int()
    .positive()
    .max(MAX_SIZE_BYTES, "size_bytes cannot exceed 5 MB"),
});

export type SignAttachmentInput = z.infer<typeof signAttachmentSchema>;
export type RegisterAttachmentInput = z.infer<typeof registerAttachmentSchema>;

