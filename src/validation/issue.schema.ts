import { z } from "zod";

export const createIssueSchema = z.object({
  title: z
    .string({ error: "title is required" })
    .trim()
    .min(1, "title must be at least 1 character")
    .max(200, "title cannot exceed 200 characters"),
  description: z
    .string({ error: "description is required" })
    .trim()
    .min(1, "description must be at least 1 character")
    .max(5000, "description cannot exceed 5000 characters"),
  type: z.enum(["bug", "feature_request"], {
    error: "type must be either 'bug' or 'feature_request'",
  }),
  app_name: z.string().trim().max(150, "app_name cannot exceed 150 characters").optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  labelIds: z.array(z.number().int().positive()).optional(),
});

export const updateIssueSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "title must be at least 1 character")
    .max(200, "title cannot exceed 200 characters")
    .optional(),
  description: z
    .string()
    .trim()
    .min(1, "description must be at least 1 character")
    .max(5000, "description cannot exceed 5000 characters")
    .optional(),
  type: z
    .enum(["bug", "feature_request"], {
      error: "type must be either 'bug' or 'feature_request'",
    })
    .optional(),
  status: z
    .enum(["open", "in_progress", "resolved"], {
      error: "status must be 'open', 'in_progress', or 'resolved'",
    })
    .optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  labelIds: z.array(z.number().int().positive()).optional(),
});

export const decideIssueApprovalSchema = z
  .object({
    action: z.enum(["approved", "rejected"], {
      error: "action must be either 'approved' or 'rejected'",
    }),
    reason: z
      .string()
      .trim()
      .max(500, "reason cannot exceed 500 characters")
      .optional(),
  })
  .refine(
    (data) => {
      if (data.action === "rejected") {
        return !!data.reason && data.reason.length >= 1 && data.reason.length <= 500;
      }
      return true;
    },
    {
      message: "reason is required when rejecting (1 to 500 characters)",
      path: ["reason"],
    },
  );

export const listIssuesQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  assignee: z.string().optional(),
  label: z.union([z.string(), z.array(z.string())]).optional(),
  sort: z.enum(["newest", "oldest"]).optional().default("newest"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listPendingIssuesQuerySchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const myRequestsQuerySchema = z.object({
  status: z.string().optional(),
  projectId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
