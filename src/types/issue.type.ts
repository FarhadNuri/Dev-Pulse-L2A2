export interface IIssue {
  id: number;
  title: string;
  description: string;
  type: "bug" | "feature_request";
  status: "open" | "in_progress" | "resolved";
  reporter_id: number;
  created_at: string;
  updated_at: string;
}

export interface IIssueWithReporter {
  id: number;
  title: string;
  description: string;
  type: "bug" | "feature_request";
  status: "open" | "in_progress" | "resolved";
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
}

export interface IUpdateIssueRequest {
  title?: string;
  description?: string;
  type?: "bug" | "feature_request";
  status?: "open" | "in_progress" | "resolved";
}
