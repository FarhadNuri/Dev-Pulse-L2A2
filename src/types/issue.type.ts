export interface IIssue {
  id: number;
  title: string;
  description: string;
  type: "bug" | "feature_request";
  status: "open" | "in_progress" | "resolved";
  reporter_id: number;
  approval_status: "pending" | "approved" | "rejected";
  app_name?: string;
  approved_by?: number;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface IIssueWithReporter {
  id: number;
  title: string;
  description: string;
  type: "bug" | "feature_request";
  status: "open" | "in_progress" | "resolved";
  approval_status: "pending" | "approved" | "rejected";
  app_name?: string;
  approved_by?: number;
  approved_at?: string;
  reporter: {
    id: number;
    name: string;
    role: string;
  };
  created_at: string;
  updated_at: string;
}

export interface ICreateIssueRequest {
  title: string;
  description: string;
  type: "bug" | "feature_request";
  app_name?: string;
}

export interface IUpdateIssueRequest {
  title?: string;
  description?: string;
  type?: "bug" | "feature_request";
  status?: "open" | "in_progress" | "resolved";
}

export interface IApproveIssueRequest {
  action: "approved" | "rejected";
}
