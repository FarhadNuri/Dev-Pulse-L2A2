import type { ServerResponse } from "http";
import { StatusCodes } from "http-status-codes";
import { parseBody } from "../utility/parseBody";
import { sendResponse } from "../utility/sendResponse";
import * as issueService from "../service/issue.service";
import { ValidationError } from "../service/issue.service";
import { pool } from "../database/db";
import type { OrgRequest } from "../types/org.type";
import { validateSchema } from "../validation";
import {
  createIssueSchema,
  updateIssueSchema,
  decideIssueApprovalSchema,
  listIssuesQuerySchema,
  listPendingIssuesQuerySchema,
  myRequestsQuerySchema,
} from "../validation/issue.schema";

/**
 * POST /api/orgs/:orgId/projects/:projectId/issues
 */
export async function createIssueController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const projectId = Number(req.params?.projectId);
    const rawBody = await parseBody(req);
    const validation = validateSchema(createIssueSchema, rawBody);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }
    const body = validation.data;

    const callerProjectRole = (req as any).projectRole;
    const isClient = callerProjectRole === "client" || req.orgRole === "guest";
    const approvalStatus = isClient ? "pending" : "approved";

    const issue = await issueService.createIssue(
      orgId,
      projectId,
      body.title,
      body.description,
      body.type,
      req.user!.id,
      approvalStatus,
      body.app_name,
      body.assigneeId,
      body.labelIds,
      !!req.actingAsSuperAdmin
    );

    return sendResponse(res, StatusCodes.CREATED, true, "Issue created successfully", issue);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, error.message);
    }
    console.error("createIssue error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to create issue");
  }
}

/**
 * GET /api/orgs/:orgId/projects/:projectId/issues
 */
export async function listIssuesController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const projectId = Number(req.params?.projectId);

    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const queryObj = Object.fromEntries(url.searchParams.entries());

    // Extract all repeatable label parameters
    const labelParams = url.searchParams.getAll("label");
    if (labelParams.length > 0) {
      (queryObj as any).label = labelParams.length === 1 ? labelParams[0] : labelParams;
    }

    const validation = validateSchema(listIssuesQuerySchema, queryObj);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }
    const { search, status, type, assignee, label, sort, page, limit } = validation.data;

    const callerProjectRole =
      (req as any).projectRole ||
      (req.orgRole === "owner" || req.orgRole === "admin" || !!req.actingAsSuperAdmin
        ? "maintainer"
        : "contributor");

    const result = await issueService.listIssues(orgId, projectId, req.user!.id, callerProjectRole, {
      search,
      status,
      type,
      assignee,
      label,
      sort,
      page,
      limit,
    });

    return sendResponse(res, StatusCodes.OK, true, "Issues retrieved successfully", result);
  } catch (error) {
    console.error("listIssues error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to list issues");
  }
}

/**
 * GET /api/orgs/:orgId/issues/pending
 * Maintainer only.
 */
export async function listPendingIssuesController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const queryObj = Object.fromEntries(url.searchParams.entries());
    const validation = validateSchema(listPendingIssuesQuerySchema, queryObj);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }
    const { projectId, page, limit } = validation.data;

    const result = await issueService.listPendingIssues(orgId, { projectId, page, limit });
    return sendResponse(res, StatusCodes.OK, true, "Pending issues retrieved", result);
  } catch (error) {
    console.error("listPendingIssues error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to list pending issues");
  }
}

/**
 * GET /api/orgs/:orgId/issues/:issueId
 */
export async function getSingleIssueController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const issueId = Number(req.params?.issueId);

    const issue = await issueService.getSingleIssue(orgId, issueId);
    if (!issue) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, "Issue not found");
    }

    const isMaintainer = req.orgRole === "owner" || req.orgRole === "admin" || !!req.actingAsSuperAdmin;
    if (!isMaintainer) {
      if (req.orgRole === "guest") {
        if (issue.reporter.id !== req.user!.id) {
          return sendResponse(res, StatusCodes.FORBIDDEN, false, "Guests can only view their own issues");
        }
      } else {
        // Org member: check approved project membership
        const pmRes = await pool.query(
          "SELECT role, status FROM project_members WHERE project_id = $1 AND user_id = $2",
          [issue.project_id, req.user!.id]
        );
        if (pmRes.rows.length === 0 || pmRes.rows[0].status !== "approved") {
          return sendResponse(res, StatusCodes.FORBIDDEN, false, "You do not have access to this project's issues");
        }
        if (pmRes.rows[0].role === "client" && issue.reporter.id !== req.user!.id) {
          return sendResponse(res, StatusCodes.FORBIDDEN, false, "Clients can only view their own issues");
        }
      }
    }

    return sendResponse(res, StatusCodes.OK, true, "Issue retrieved successfully", issue);
  } catch (error) {
    console.error("getSingleIssue error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to retrieve issue");
  }
}

/**
 * PATCH /api/orgs/:orgId/issues/:issueId
 */
export async function updateIssueController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const issueId = Number(req.params?.issueId);
    const rawBody = await parseBody(req);
    const validation = validateSchema(updateIssueSchema, rawBody);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }
    const body = validation.data;

    const issue = await issueService.getSingleIssue(orgId, issueId);
    if (!issue) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, "Issue not found");
    }

    const isMaintainer = req.orgRole === "owner" || req.orgRole === "admin" || !!req.actingAsSuperAdmin;
    const isReporter = issue.reporter.id === req.user!.id;

    // Determine if caller is acting as client on this project
    let isClientCaller = req.orgRole === "guest";
    if (!isMaintainer && !isClientCaller) {
      const pmRes = await pool.query(
        "SELECT role, status FROM project_members WHERE project_id = $1 AND user_id = $2",
        [issue.project_id, req.user!.id]
      );
      if (pmRes.rows.length === 0 || pmRes.rows[0].status !== "approved") {
        return sendResponse(res, StatusCodes.FORBIDDEN, false, "You do not have access to this project");
      }
      if (pmRes.rows[0].role === "client") {
        isClientCaller = true;
      }
    }

    if (isClientCaller) {
      // Client rules:
      // 1. Only own issues
      if (!isReporter) {
        return sendResponse(res, StatusCodes.FORBIDDEN, false, "Clients can only update their own issues");
      }
      // 2. Only while pending or rejected. Once approved, can no longer edit
      if (issue.approval_status === "approved") {
        return sendResponse(res, StatusCodes.FORBIDDEN, false, "Approved issues cannot be edited by clients");
      }
      // 3. Clients can never send status/assignee/labels (403)
      if (
        (rawBody as any).status !== undefined ||
        (rawBody as any).assigneeId !== undefined ||
        (rawBody as any).labelIds !== undefined
      ) {
        return sendResponse(res, StatusCodes.FORBIDDEN, false, "Clients cannot modify status, assignee, or labels");
      }
    }

    const updated = await issueService.updateIssue(
      orgId,
      issueId,
      {
        title: body.title,
        description: body.description,
        type: body.type,
        status: body.status,
        assigneeId: body.assigneeId,
        labelIds: body.labelIds,
      },
      req.user!.id,
      !!req.actingAsSuperAdmin
    );

    return sendResponse(res, StatusCodes.OK, true, "Issue updated successfully", updated);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, error.message);
    }
    console.error("updateIssue error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to update issue");
  }
}

/**
 * DELETE /api/orgs/:orgId/issues/:issueId
 */
export async function deleteIssueController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const issueId = Number(req.params?.issueId);

    const issue = await issueService.getSingleIssue(orgId, issueId);
    if (!issue) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, "Issue not found");
    }

    const isMaintainer = req.orgRole === "owner" || req.orgRole === "admin" || !!req.actingAsSuperAdmin;
    const isReporter = issue.reporter.id === req.user!.id;

    if (!isMaintainer && !isReporter) {
      return sendResponse(res, StatusCodes.FORBIDDEN, false, "You can only delete your own issues");
    }

    await issueService.deleteIssue(orgId, issueId, req.user!.id, !!req.actingAsSuperAdmin);

    res.writeHead(StatusCodes.NO_CONTENT);
    res.end();
    return;
  } catch (error) {
    console.error("deleteIssue error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to delete issue");
  }
}

/**
 * PATCH /api/orgs/:orgId/issues/:issueId/approve
 */
export async function decideIssueApprovalController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const issueId = Number(req.params?.issueId);
    const rawBody = await parseBody(req);
    const validation = validateSchema(decideIssueApprovalSchema, rawBody);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }
    const body = validation.data;

    const existingIssue = await issueService.getSingleIssue(orgId, issueId);
    if (!existingIssue) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, "Issue not found");
    }

    if (existingIssue.approval_status !== "pending") {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, "Issue is not in pending approval status");
    }

    const updated = await issueService.decideIssueApproval(
      orgId,
      issueId,
      body.action,
      req.user!.id,
      body.reason,
      !!req.actingAsSuperAdmin
    );

    return sendResponse(res, StatusCodes.OK, true, `Issue ${body.action} successfully`, updated);
  } catch (error) {
    console.error("approveIssue error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to approve/reject issue");
  }
}

/**
 * POST /api/orgs/:orgId/issues/:issueId/resubmit
 */
export async function resubmitIssueController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const issueId = Number(req.params?.issueId);

    const issue = await issueService.getSingleIssue(orgId, issueId);
    if (!issue) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, "Issue not found");
    }

    if (issue.reporter.id !== req.user!.id) {
      return sendResponse(res, StatusCodes.FORBIDDEN, false, "Only the reporter can resubmit this issue");
    }

    if (issue.approval_status !== "rejected") {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, "Only rejected issues can be resubmitted");
    }

    const resubmitted = await issueService.resubmitIssue(
      orgId,
      issueId,
      req.user!.id,
      !!req.actingAsSuperAdmin
    );
    return sendResponse(res, StatusCodes.OK, true, "Issue resubmitted for approval", resubmitted);
  } catch (error) {
    console.error("resubmitIssue error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to resubmit issue");
  }
}

/**
 * GET /api/orgs/:orgId/my-requests
 */
export async function getMyRequestsController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const queryObj = Object.fromEntries(url.searchParams.entries());
    const validation = validateSchema(myRequestsQuerySchema, queryObj);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }
    const { status, projectId, page, limit } = validation.data;

    const result = await issueService.getMyRequests(orgId, req.user!.id, { status, projectId, page, limit });
    return sendResponse(res, StatusCodes.OK, true, "My requests retrieved", result);
  } catch (error) {
    console.error("getMyRequests error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to retrieve my requests");
  }
}
