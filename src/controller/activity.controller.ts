import type { ServerResponse } from "http";
import { StatusCodes } from "http-status-codes";
import { sendResponse } from "../utility/sendResponse";
import type { OrgRequest } from "../types/org.type";
import * as activityService from "../service/activity.service";
import { pool } from "../database/db";

/**
 * GET /api/orgs/:orgId/projects/:projectId/activity
 * Maintainers and Contributors only (Guests get 403).
 */
export async function listProjectActivityController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const projectId = Number(req.params?.projectId);

    // Guest / Client check
    if (req.orgRole === "guest" || (req as any).projectRole === "client") {
      return sendResponse(res, StatusCodes.FORBIDDEN, false, "Guests are not allowed to view project activity");
    }

    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 30;
    const before = url.searchParams.get("before") ? Number(url.searchParams.get("before")) : undefined;

    const data = await activityService.listProjectActivity(orgId, projectId, {
      limit,
      before,
    });

    return sendResponse(res, StatusCodes.OK, true, "Project activity retrieved successfully", data);
  } catch (error) {
    console.error("listProjectActivity error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to retrieve project activity");
  }
}

/**
 * GET /api/orgs/:orgId/issues/:issueId/activity
 * Maintainers and Contributors only (Guests get 403).
 */
export async function listIssueActivityController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const issueId = Number(req.params?.issueId);

    // Verify issue exists and belongs to this org
    const issueRes = await pool.query(
      `SELECT i.id, i.project_id, pm.role AS pm_role, pm.status AS pm_status
       FROM issues i
       JOIN projects p ON p.id = i.project_id
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $3
       WHERE i.id = $1 AND p.org_id = $2`,
      [issueId, orgId, req.user!.id]
    );

    if (issueRes.rows.length === 0) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, "Issue not found");
    }

    const issue = issueRes.rows[0];
    const isMaintainer = req.orgRole === "owner" || req.orgRole === "admin" || req.actingAsSuperAdmin;
    const isApprovedContributor = issue.pm_role === "contributor" && issue.pm_status === "approved";

    // Guests / clients are forbidden
    if (req.orgRole === "guest" || issue.pm_role === "client" || (!isMaintainer && !isApprovedContributor)) {
      return sendResponse(res, StatusCodes.FORBIDDEN, false, "Guests are not allowed to view issue activity");
    }

    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 30;
    const before = url.searchParams.get("before") ? Number(url.searchParams.get("before")) : undefined;

    const data = await activityService.listIssueActivity(orgId, issueId, {
      limit,
      before,
    });

    return sendResponse(res, StatusCodes.OK, true, "Issue activity retrieved successfully", data);
  } catch (error) {
    console.error("listIssueActivity error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to retrieve issue activity");
  }
}

/**
 * GET /api/orgs/:orgId/activity
 * Owner only.
 */
export async function listOrgActivityController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);

    if (req.orgRole !== "owner" && !req.actingAsSuperAdmin) {
      return sendResponse(res, StatusCodes.FORBIDDEN, false, "Only the organization owner can view org-wide activity");
    }

    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 30;
    const before = url.searchParams.get("before") ? Number(url.searchParams.get("before")) : undefined;
    const actor = url.searchParams.get("actor") ? Number(url.searchParams.get("actor")) : undefined;
    const action = url.searchParams.get("action") || undefined;

    const data = await activityService.listOrgActivity(orgId, {
      limit,
      before,
      actor,
      action,
    });

    return sendResponse(res, StatusCodes.OK, true, "Organization activity retrieved successfully", data);
  } catch (error) {
    console.error("listOrgActivity error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to retrieve organization activity");
  }
}

