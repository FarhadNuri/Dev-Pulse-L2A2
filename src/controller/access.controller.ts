import type { ServerResponse } from "http";
import { StatusCodes } from "http-status-codes";
import { parseBody } from "../utility/parseBody";
import { sendResponse } from "../utility/sendResponse";
import * as accessService from "../service/access.service";
import { ConflictError, NotFoundError } from "../service/org.service";
import type { OrgRequest } from "../types/org.type";
import { validateSchema } from "../validation";
import { decideAccessRequestSchema, addProjectMemberSchema } from "../validation/project.schema";

/**
 * POST /api/orgs/:orgId/projects/:projectId/request-access
 */
export async function requestAccessController(req: OrgRequest, res: ServerResponse) {
  try {
    const projectId = Number(req.params?.projectId);

    // Guests cannot request access
    if (req.orgRole === "guest") {
      return sendResponse(res, StatusCodes.FORBIDDEN, false, "Guests cannot request project access");
    }

    const access = await accessService.requestAccess(projectId, req.user!.id, !!req.actingAsSuperAdmin);
    return sendResponse(res, StatusCodes.CREATED, true, "Access requested successfully", access);
  } catch (error) {
    console.error("requestAccess error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to request access");
  }
}

/**
 * GET /api/orgs/:orgId/projects/:projectId/access-requests
 */
export async function listRequestsController(req: OrgRequest, res: ServerResponse) {
  try {
    const projectId = Number(req.params?.projectId);
    const requests = await accessService.listPendingRequests(projectId);
    return sendResponse(res, StatusCodes.OK, true, "Access requests retrieved", requests);
  } catch (error) {
    console.error("listRequests error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to list access requests");
  }
}

/**
 * PATCH /api/orgs/:orgId/projects/:projectId/access-requests/:memberId
 */
export async function decideRequestController(req: OrgRequest, res: ServerResponse) {
  try {
    const projectId = Number(req.params?.projectId);
    const memberId = Number(req.params?.memberId);
    const rawBody = await parseBody(req);
    const validation = validateSchema(decideAccessRequestSchema, rawBody);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }
    const body = validation.data;
    const action = (body.action === "approved" || body.action === "approve") ? "approve" : "reject";

    const result = await accessService.decideRequest(projectId, memberId, action, req.user!.id, !!req.actingAsSuperAdmin);
    return sendResponse(res, StatusCodes.OK, true, `Request ${action}d successfully`, result);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("decideRequest error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to update access request");
  }
}

/**
 * GET /api/orgs/:orgId/projects/:projectId/members
 */
export async function listProjectMembersController(req: OrgRequest, res: ServerResponse) {
  try {
    const projectId = Number(req.params?.projectId);
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const role = url.searchParams.get("role") || undefined;
    const status = url.searchParams.get("status") || "approved";

    const members = await accessService.listProjectMembers(projectId, { role, status });
    return sendResponse(res, StatusCodes.OK, true, "Project members retrieved", members);
  } catch (error) {
    console.error("listProjectMembers error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to list project members");
  }
}

/**
 * POST /api/orgs/:orgId/projects/:projectId/members
 */
export async function addProjectMemberController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const projectId = Number(req.params?.projectId);
    const rawBody = await parseBody(req);
    const validation = validateSchema(addProjectMemberSchema, rawBody);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }
    const body = validation.data;

    const member = await accessService.addProjectMember(
      orgId,
      projectId,
      { userId: body.userId, email: body.email },
      req.user!.id,
      body.role,
      !!req.actingAsSuperAdmin
    );
    const message = (member as any)?.invited
      ? (member as any).message
      : "Member added successfully";
    return sendResponse(res, StatusCodes.CREATED, true, message, member);
  } catch (error) {
    if (error instanceof ConflictError) {
      return sendResponse(res, StatusCodes.CONFLICT, false, error.message);
    }
    if (error instanceof NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("addProjectMember error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to add project member");
  }
}

/**
 * PATCH /api/orgs/:orgId/projects/:projectId/members/:memberId/revoke
 */
export async function revokeProjectMemberController(req: OrgRequest, res: ServerResponse) {
  try {
    const projectId = Number(req.params?.projectId);
    const memberId = Number(req.params?.memberId);

    const result = await accessService.revokeProjectMember(projectId, memberId, req.user!.id, !!req.actingAsSuperAdmin);
    return sendResponse(res, StatusCodes.OK, true, "Member access revoked successfully", result);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("revokeProjectMember error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to revoke project member");
  }
}
