import type { ServerResponse } from "http";
import { pool } from "../database/db";
import { sendResponse } from "../utility/sendResponse";
import { StatusCodes } from "http-status-codes";
import type { OrgRequest, OrgRole } from "../types/org.type";

/**
 * Validates that the logged-in user has access to the specified organization.
 * - Non-members receive a 404 to avoid leaking org existence.
 * - Super admins bypass membership checks, are treated as 'owner', and flagged with actingAsSuperAdmin = true if not a real member.
 * - Suspended organizations reject write methods (POST, PATCH, DELETE, PUT) with 403.
 */
export async function requireOrgAccess(
  req: OrgRequest,
  res: ServerResponse,
  orgId: number
): Promise<boolean> {
  if (!req.user?.id) {
    sendResponse(res, StatusCodes.UNAUTHORIZED, false, "Authentication required");
    return false;
  }

  if (isNaN(orgId) || orgId <= 0) {
    sendResponse(res, StatusCodes.NOT_FOUND, false, "Organization not found");
    return false;
  }

  try {
    // 1. Fetch organization metadata
    const orgResult = await pool.query(
      "SELECT id, name, slug, status FROM organizations WHERE id = $1",
      [orgId]
    );

    if (orgResult.rows.length === 0) {
      sendResponse(res, StatusCodes.NOT_FOUND, false, "Organization not found");
      return false;
    }

    const org = orgResult.rows[0];

    // 2. Fetch membership and check if user is a platform super admin
    const memberResult = await pool.query(
      `SELECT
         om.role AS member_role,
         u.is_super_admin
       FROM users u
       LEFT JOIN organization_members om ON om.user_id = u.id AND om.org_id = $1
       WHERE u.id = $2`,
      [orgId, req.user.id]
    );

    const userRecord = memberResult.rows[0];
    if (!userRecord) {
      sendResponse(res, StatusCodes.NOT_FOUND, false, "Organization not found");
      return false;
    }

    const isMember = !!userRecord.member_role;
    const isSuperAdmin = !!userRecord.is_super_admin;

    if (!isMember && !isSuperAdmin) {
      // Rule: Not a member returns 404 to never reveal other companies' data
      sendResponse(res, StatusCodes.NOT_FOUND, false, "Organization not found");
      return false;
    }

    // Attach organization and role to request
    req.org = {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
    };

    if (isMember) {
      req.orgRole = userRecord.member_role as OrgRole;
      req.actingAsSuperAdmin = false;
    } else {
      // Super admin bypass: treated as role 'owner'
      req.orgRole = "owner";
      req.actingAsSuperAdmin = true;
    }

    // 3. Organization status check: suspended allows GET, but 403 for writes
    const method = req.method?.toUpperCase();
    if (org.status === "suspended" && method !== "GET") {
      sendResponse(res, StatusCodes.FORBIDDEN, false, "Organization suspended");
      return false;
    }

    return true;
  } catch (error) {
    console.error("requireOrgAccess error:", error);
    sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to verify organization access");
    return false;
  }
}

