import { z } from "zod";

export function formatZodError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid input";
  const field = issue.path.join(".");
  return field ? `${field}: ${issue.message}` : issue.message;
}

export function validateSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; error: string; issues: z.ZodIssue[] } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: formatZodError(result.error),
    issues: result.error.issues,
  };
}

export * from "./auth.schema";
export * from "./org.schema";
export * from "./project.schema";
export * from "./issue.schema";
export * from "./comment.schema";
export * from "./invitation.schema";
export * from "./label.schema";
