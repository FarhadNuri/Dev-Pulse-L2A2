import type { ServerResponse } from "http";
import { pool } from "../database/db";
import { sendResponse } from "../utility/sendResponse";
import { StatusCodes } from "http-status-codes";
import type { OrgRequest } from "../types/org.type";

/**
 * Multi-tenant project access middleware:
 * - Checks that the project exists and belongs to the organization in the URL (returns 404 otherwise).
 * - Org maintainers (owner, admin, super admin) are granted full access.
 * - Org members and guests require an approved row in project_members (returns 403 otherwise).
 */
export async function requireProjectAccess(
  req: OrgRequest,
  res: ServerResponse,
  projectId: number
): Promise<boolean> {
  if (!req.org?.id) {
    sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Organization context missing");
    return false;
  }

  if (isNaN(projectId) || projectId <= 0) {
    sendResponse(res, StatusCodes.NOT_FOUND, false, "Project not found");
    return false;
  }

  try {
    // 1. Verify that the project exists and belongs to the org in the URL
    const projectRes = await pool.query(
      "SELECT id, org_id, name, description, archived_at, created_at FROM projects WHERE id = $1",
      [projectId]
    );

    if (projectRes.rows.length === 0) {
      sendResponse(res, StatusCodes.NOT_FOUND, false, "Project not found");
      return false;
    }

    const project = projectRes.rows[0];
    if (project.org_id !== req.org.id) {
      // Rule: Never reveal projects of another organization -> 404
      sendResponse(res, StatusCodes.NOT_FOUND, false, "Project not found");
      return false;
    }

    (req as any).project = project;

    // 2. Maintainers (owner, admin, super admin) have full access to all projects in the org
    if (
      req.orgRole === "owner" ||
      req.orgRole === "admin" ||
      req.actingAsSuperAdmin
    ) {
      (req as any).projectRole = "maintainer";
      return true;
    }

    // 3. For members and guests: check approved membership in project_members
    const memberRes = await pool.query(
      "SELECT role, status FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, req.user!.id]
    );

    if (memberRes.rows.length === 0) {
      sendResponse(res, StatusCodes.FORBIDDEN, false, "You do not have access to this project", {
        access_status: "none",
      });
      return false;
    }

    const membership = memberRes.rows[0];
    if (membership.status !== "approved") {
      sendResponse(res, StatusCodes.FORBIDDEN, false, "You do not have access to this project", {
        access_status: membership.status,
      });
      return false;
    }

    (req as any).projectRole = membership.role;
    return true;
  } catch (error) {
    console.error("requireProjectAccess error:", error);
    sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to verify project access");
    return false;
  }
}
