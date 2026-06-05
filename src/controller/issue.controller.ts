import type { ServerResponse } from "http";
import { parseBody } from "../utility/parseBody";
import { sendResponse } from "../utility/sendResponse";
import {
  createIssue,
  getAllIssues,
  getIssueById,
  updateIssue,
  deleteIssue,
  getPendingIssues,
  approveIssue,
} from "../service/issue.service";
import { findUsersByIds } from "../service/user.service";
import { StatusCodes } from "http-status-codes";
import type { AuthRequest } from "../middleware/auth";
import type { ICreateIssueRequest, IUpdateIssueRequest, IApproveIssueRequest } from "../types/issue.type";


export const createIssueController = async (
  req: AuthRequest,
  res: ServerResponse,
) => {
  try {
    const body: ICreateIssueRequest = await parseBody(req);

    if (!body.title || !body.description || !body.type) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Title, description, and type are required",
      );
    }

    if (body.title.length > 150) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Title must not exceed 150 characters",
      );
    }

    if (body.description.length < 20) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Description must be at least 20 characters",
      );
    }

    if (body.type !== "bug" && body.type !== "feature_request") {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Type must be either 'bug' or 'feature_request'",
      );
    }

    const reporterId = req.user?.id;
    const userRole = req.user?.role;
    
    if (!reporterId || !userRole) {
      return sendResponse(
        res,
        StatusCodes.UNAUTHORIZED,
        false,
        "Authentication required",
      );
    }

    // Determine approval status and app_name requirements based on role
    let approvalStatus = "approved";
    let appName = body.app_name;

    if (userRole === "client") {
      approvalStatus = "pending";
      if (!body.app_name) {
        return sendResponse(
          res,
          StatusCodes.BAD_REQUEST,
          false,
          "app_name is required for client users",
        );
      }
    }

    const newIssue = await createIssue(
      body.title,
      body.description,
      body.type,
      reporterId,
      appName,
      approvalStatus,
    );

    return sendResponse(
      res,
      StatusCodes.CREATED,
      true,
      "Issue created successfully",
      newIssue,
    );
  } catch (error) {
    console.error("Create issue error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Something went wrong!",
      undefined,
      error,
    );
  }
};

export const getAllIssuesController = async (
  req: AuthRequest,
  res: ServerResponse,
) => {
  try {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const sortOrder = url.searchParams.get("sort") || "newest";
    const typeFilter = url.searchParams.get("type") || undefined;
    const statusFilter = url.searchParams.get("status") || undefined;

    if (typeFilter && typeFilter !== "bug" && typeFilter !== "feature_request") {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Invalid type filter. Must be 'bug' or 'feature_request'",
      );
    }

    if (
      statusFilter &&
      statusFilter !== "open" &&
      statusFilter !== "in_progress" &&
      statusFilter !== "resolved"
    ) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Invalid status filter. Must be 'open', 'in_progress', or 'resolved'",
      );
    }

    const issues = await getAllIssues(
      sortOrder, 
      typeFilter, 
      statusFilter,
      req.user?.role,
      req.user?.id,
    );

    const reporterIds = [...new Set(issues.map((issue) => issue.reporter_id))];

    const reporters = await findUsersByIds(reporterIds);

    const issuesWithReporters = issues.map((issue) => {
      const reporter = reporters.find((r) => r.id === issue.reporter_id);
      const { reporter_id, ...issueWithoutReporterId } = issue;
      return {
        ...issueWithoutReporterId,
        reporter: reporter
          ? { id: reporter.id, name: reporter.name, role: reporter.role }
          : { id: reporter_id, name: "Unknown", role: "unknown" },
      };
    });

    return sendResponse(res, StatusCodes.OK, true, "Issues retrieved successfully", issuesWithReporters);
  } catch (error) {
    console.error("Get all issues error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Something went wrong!",
      undefined,
      error,
    );
  }
};

export const getSingleIssueController = async (
  req: AuthRequest,
  res: ServerResponse,
  id: number,
) => {
  try {
    const issue = await getIssueById(id);

    if (!issue) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, "Issue not found");
    }

    const reporters = await findUsersByIds([issue.reporter_id]);
    const reporter = reporters[0];

    const { reporter_id, ...issueWithoutReporterId } = issue;
    const issueWithReporter = {
      ...issueWithoutReporterId,
      reporter: reporter
        ? { id: reporter.id, name: reporter.name, role: reporter.role }
        : { id: reporter_id, name: "Unknown", role: "unknown" },
    };

    return sendResponse(
      res,
      StatusCodes.OK,
      true,
      "Issue retrieved successfully",
      issueWithReporter,
    );
  } catch (error) {
    console.error("Get single issue error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Something went wrong!",
      undefined,
      error,
    );
  }
};

export const updateIssueController = async (
  req: AuthRequest,
  res: ServerResponse,
  id: number,
) => {
  try {
    const body: IUpdateIssueRequest = await parseBody(req);

    const existingIssue = await getIssueById(id);
    if (!existingIssue) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, "Issue not found");
    }

    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return sendResponse(
        res,
        StatusCodes.UNAUTHORIZED,
        false,
        "Authentication required",
      );
    }

    if (userRole !== "maintainer") {
      if (existingIssue.reporter_id !== userId) {
        return sendResponse(
          res,
          StatusCodes.FORBIDDEN,
          false,
          "You can only update your own issues",
        );
      }
    }

    if (body.title && body.title.length > 150) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Title must not exceed 150 characters",
      );
    }

    if (body.description && body.description.length < 20) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Description must be at least 20 characters",
      );
    }

    if (body.type && body.type !== "bug" && body.type !== "feature_request") {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Type must be either 'bug' or 'feature_request'",
      );
    }

    if (body.status && body.status !== "open" && body.status !== "in_progress" && body.status !== "resolved") {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Status must be 'open', 'in_progress', or 'resolved'",
      );
    }

    const updatedIssue = await updateIssue(
      id,
      body.title,
      body.description,
      body.type,
      body.status,
    );

    if (!updatedIssue) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "No fields to update",
      );
    }

    return sendResponse(
      res,
      StatusCodes.OK,
      true,
      "Issue updated successfully",
      updatedIssue,
    );
  } catch (error) {
    console.error("Update issue error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Something went wrong!",
      undefined,
      error,
    );
  }
};

export const deleteIssueController = async (
  req: AuthRequest,
  res: ServerResponse,
  id: number,
) => {
  try {
    const existingIssue = await getIssueById(id);
    if (!existingIssue) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, "Issue not found");
    }

    const deleted = await deleteIssue(id);

    if (!deleted) {
      return sendResponse(
        res,
        StatusCodes.INTERNAL_SERVER_ERROR,
        false,
        "Failed to delete issue",
      );
    }

    return sendResponse(res, StatusCodes.OK, true, "Issue deleted successfully");
  } catch (error) {
    console.error("Delete issue error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Something went wrong!",
      undefined,
      error,
    );
  }
};

export const getPendingIssuesController = async (
  req: AuthRequest,
  res: ServerResponse,
) => {
  try {
    const issues = await getPendingIssues();

    const reporterIds = [...new Set(issues.map((issue) => issue.reporter_id))];
    const reporters = await findUsersByIds(reporterIds);

    const issuesWithReporters = issues.map((issue) => {
      const reporter = reporters.find((r) => r.id === issue.reporter_id);
      const { reporter_id, ...issueWithoutReporterId } = issue;
      return {
        ...issueWithoutReporterId,
        reporter: reporter
          ? { id: reporter.id, name: reporter.name, role: reporter.role }
          : { id: reporter_id, name: "Unknown", role: "unknown" },
      };
    });

    return sendResponse(
      res,
      StatusCodes.OK,
      true,
      "Pending issues retrieved successfully",
      issuesWithReporters,
    );
  } catch (error) {
    console.error("Get pending issues error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Something went wrong!",
      undefined,
      error,
    );
  }
};

export const approveIssueController = async (
  req: AuthRequest,
  res: ServerResponse,
  id: number,
) => {
  try {
    const body: IApproveIssueRequest = await parseBody(req);

    if (!body.action || (body.action !== "approved" && body.action !== "rejected")) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Action must be 'approved' or 'rejected'",
      );
    }

    const existingIssue = await getIssueById(id);
    if (!existingIssue) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, "Issue not found");
    }

    if (existingIssue.approval_status !== "pending") {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Issue has already been approved or rejected",
      );
    }

    const maintainerId = req.user?.id;
    if (!maintainerId) {
      return sendResponse(
        res,
        StatusCodes.UNAUTHORIZED,
        false,
        "Authentication required",
      );
    }

    const updatedIssue = await approveIssue(id, body.action, maintainerId);

    return sendResponse(
      res,
      StatusCodes.OK,
      true,
      `Issue ${body.action} successfully`,
      updatedIssue,
    );
  } catch (error) {
    console.error("Approve issue error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Something went wrong!",
      undefined,
      error,
    );
  }
};
