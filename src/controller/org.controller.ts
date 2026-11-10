import type { ServerResponse } from "http";
import { StatusCodes } from "http-status-codes";
import { parseBody } from "../utility/parseBody";
import { sendResponse } from "../utility/sendResponse";
import * as orgService from "../service/org.service";
import { ConflictError, NotFoundError } from "../service/org.service";
import type { OrgRequest } from "../types/org.type";
import {
  validateSchema,
  createOrgSchema,
  updateOrgSchema,
  transferOwnershipSchema,
  updateMemberRoleSchema,
  listMembersQuerySchema,
} from "../validation";

/**
 * POST /api/orgs
 * Create a new organization. Caller becomes 'owner'.
 */
export async function createOrgController(req: OrgRequest, res: ServerResponse) {
  try {
    const rawBody = await parseBody(req);
    const val = validateSchema(createOrgSchema, rawBody);
    if (!val.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, val.error);
    }

    const org = await orgService.createOrganization(val.data.name, req.user!.id);
    return sendResponse(res, StatusCodes.CREATED, true, "Organization created successfully", org);
  } catch (error) {
    console.error("createOrg error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to create organization");
  }
}

/**
 * GET /api/orgs
 * Returns all organizations the caller belongs to (for sidebar switcher).
 */
export async function listMyOrgsController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgs = await orgService.getOrganizationsForUser(req.user!.id);
    return sendResponse(res, StatusCodes.OK, true, "Organizations fetched successfully", orgs);
  } catch (error) {
    console.error("listMyOrgs error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to fetch organizations");
  }
}

/**
 * GET /api/orgs/:orgId
 * Returns organization details, current user's role, member count, and project count.
 */
export async function getOrgController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const details = await orgService.getOrganizationDetails(orgId, req.orgRole!);
    return sendResponse(res, StatusCodes.OK, true, "Organization details fetched", details);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("getOrg error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to fetch organization details");
  }
}

/**
 * PATCH /api/orgs/:orgId
 * Updates organization metadata (name). Requires 'owner' role.
 */
export async function updateOrgController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const rawBody = await parseBody(req);
    const val = validateSchema(updateOrgSchema, rawBody);
    if (!val.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, val.error);
    }

    const updated = await orgService.updateOrganization(orgId, val.data.name);
    return sendResponse(res, StatusCodes.OK, true, "Organization updated successfully", updated);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("updateOrg error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to update organization");
  }
}

/**
 * GET /api/orgs/:orgId/members
 * Lists members with query filtering (?role=&search=&page=&limit=). Requires 'owner' or 'admin'.
 */
export async function listOrgMembersController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const queryParams = {
      role: url.searchParams.get("role") || undefined,
      search: url.searchParams.get("search") || undefined,
      page: url.searchParams.get("page") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    };

    const val = validateSchema(listMembersQuerySchema, queryParams);
    if (!val.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, val.error);
    }

    const result = await orgService.listOrganizationMembers(orgId, {
      role: queryParams.role,
      search: val.data.search,
      page: val.data.page,
      limit: val.data.limit,
    });
    return sendResponse(res, StatusCodes.OK, true, "Members retrieved successfully", result);
  } catch (error) {
    console.error("listOrgMembers error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to fetch members");
  }
}

/**
 * PATCH /api/orgs/:orgId/members/:userId
 * Changes an existing member's role (admin or member). Requires 'owner'. Cannot demote last owner.
 */
export async function updateOrgMemberRoleController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const targetUserId = Number(req.params?.userId);

    const rawBody = await parseBody(req);
    const val = validateSchema(updateMemberRoleSchema, rawBody);
    if (!val.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, val.error);
    }

    const updated = await orgService.updateMemberRole(
      orgId,
      targetUserId,
      val.data.role,
      req.user!.id,
      !!req.actingAsSuperAdmin
    );
    return sendResponse(res, StatusCodes.OK, true, "Member role updated successfully", updated);
  } catch (error) {
    if (error instanceof ConflictError) {
      return sendResponse(res, StatusCodes.CONFLICT, false, error.message);
    }
    if (error instanceof NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("updateOrgMemberRole error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to update member role");
  }
}

/**
 * DELETE /api/orgs/:orgId/members/:userId
 * Removes a member (by Owner or self). Cannot remove the last owner. Returns 204.
 */
export async function removeOrgMemberController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const targetUserId = Number(req.params?.userId);
    const callerId = req.user!.id;
    const isOwner = req.orgRole === "owner";

    // Only Owner or self can remove a member
    if (!isOwner && callerId !== targetUserId) {
      return sendResponse(res, StatusCodes.FORBIDDEN, false, "Only an organization owner or the user themselves can remove a member");
    }

    await orgService.removeOrganizationMember(
      orgId,
      targetUserId,
      callerId,
      !!req.actingAsSuperAdmin
    );

    res.writeHead(StatusCodes.NO_CONTENT);
    res.end();
    return;
  } catch (error) {
    if (error instanceof ConflictError) {
      return sendResponse(res, StatusCodes.CONFLICT, false, error.message);
    }
    if (error instanceof NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("removeOrgMember error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to remove member");
  }
}

/**
 * POST /api/orgs/:orgId/transfer-ownership
 * Transfers ownership to another member. Caller becomes admin. Requires 'owner'.
 */
export async function transferOrgOwnershipController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const rawBody = await parseBody(req);
    const val = validateSchema(transferOwnershipSchema, rawBody);
    if (!val.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, val.error);
    }

    const result = await orgService.transferOrganizationOwnership(orgId, req.user!.id, val.data.userId);
    return sendResponse(res, StatusCodes.OK, true, "Ownership transferred successfully", result);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("transferOrgOwnership error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to transfer ownership");
  }
}

/**
 * GET /api/auth/me
 * Returns current user profile and the list of organizations they belong to.
 */
export async function getMeController(req: OrgRequest, res: ServerResponse) {
  try {
    const result = await orgService.getUserWithOrganizations(req.user!.id);
    return sendResponse(res, StatusCodes.OK, true, "User profile and organizations retrieved", result);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("getMe error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to fetch user profile");
  }
}
