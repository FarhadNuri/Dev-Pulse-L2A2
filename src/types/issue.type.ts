import type { ILabel } from "./label.type";
import type { IAttachment } from "./attachment.type";

export interface IIssue {
  id: number;
  project_id: number;
  title: string;
  description: string;
  type: "bug" | "feature_request";
  status: "open" | "in_progress" | "resolved";
  reporter_id: number;
  assignee_id: number | null;
  approval_status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  app_name?: string | null;
  approved_by?: number | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface IIssueFormatted {
  id: number;
  project_id: number;
  title: string;
  description: string;
  type: string;
  status: string;
  approval_status: string;
  rejection_reason: string | null;
  app_name: string | null;
  reporter: {
    id: number;
    name: string;
    email?: string;
  };
  assignee: {
    id: number;
    name: string;
    email?: string;
  } | null;
  labels: {
    id: number;
    name: string;
    color: string;
  }[];
  attachments?: IAttachment[];
  comment_count: number;
  created_at: string;
  updated_at: string;
}

export interface ICreateIssueRequest {
  title: string;
  description: string;
  type: "bug" | "feature_request";
  app_name?: string;
  assigneeId?: number | null;
  labelIds?: number[];
}

export interface IUpdateIssueRequest {
  title?: string;
  description?: string;
  type?: "bug" | "feature_request";
  status?: "open" | "in_progress" | "resolved";
  assigneeId?: number | null;
  labelIds?: number[];
}

export interface IApproveIssueRequest {
  action: "approved" | "rejected";
  reason?: string;
}
