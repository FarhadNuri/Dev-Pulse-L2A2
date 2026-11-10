import type { IncomingMessage, ServerResponse } from "http";
import { StatusCodes } from "http-status-codes";
import { parseBody } from "../utility/parseBody";
import { sendResponse } from "../utility/sendResponse";
import { pool } from "../database/db";
import type { OrgRequest } from "../types/org.type";
import { validateSchema } from "../validation";
import {
  createOrgInviteSchema,
  createClientInviteSchema,
  listInvitationsQuerySchema,
} from "../validation/invitation.schema";
import * as invitationService from "../service/invitation.service";

/**
 * POST /api/orgs/:orgId/invitations
 * Maintainers only (only Owner can invite 'admin').
 */
export async function createOrgInvitationController(
  req: OrgRequest,
  res: ServerResponse
) {
  try {
    const orgId = Number(req.params?.orgId);
    const rawBody = await parseBody(req);
    const validation = validateSchema(createOrgInviteSchema, rawBody);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }
    const { email, role } = validation.data;

    const result = await invitationService.createOrgInvitation(
      orgId,
      req.user!.id,
      req.orgRole!,
      email,
      role,
      req.actingAsSuperAdmin
    );

    return sendResponse(res, StatusCodes.CREATED, true, "Invitation created successfully", result);
  } catch (error) {
    if (error instanceof invitationService.ForbiddenError) {
      return sendResponse(res, StatusCodes.FORBIDDEN, false, error.message);
    }
    if (error instanceof invitationService.ConflictError) {
      return sendResponse(res, StatusCodes.CONFLICT, false, error.message);
    }
    if (error instanceof invitationService.NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("createOrgInvitation error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to create invitation");
  }
}

/**
 * POST /api/orgs/:orgId/projects/:projectId/invitations
 * Maintainers only (creates client invitation: org role 'guest', project role 'client').
 */
export async function createClientInvitationController(
  req: OrgRequest,
  res: ServerResponse
) {
  try {
    const orgId = Number(req.params?.orgId);
    const projectId = Number(req.params?.projectId);
    const rawBody = await parseBody(req);
    const validation = validateSchema(createClientInviteSchema, rawBody);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }
    const { email } = validation.data;

    const result = await invitationService.createClientInvitation(
      orgId,
      projectId,
      req.user!.id,
      email
    );

    return sendResponse(res, StatusCodes.CREATED, true, "Client invitation created successfully", result);
  } catch (error) {
    if (error instanceof invitationService.ConflictError) {
      return sendResponse(res, StatusCodes.CONFLICT, false, error.message);
    }
    if (error instanceof invitationService.NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("createClientInvitation error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to create client invitation");
  }
}

/**
 * GET /api/orgs/:orgId/invitations
 * Maintainers only.
 */
export async function listInvitationsController(
  req: OrgRequest,
  res: ServerResponse
) {
  try {
    const orgId = Number(req.params?.orgId);
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const statusParam = url.searchParams.get("status") || undefined;

    const validation = validateSchema(listInvitationsQuerySchema, { status: statusParam });
    const status = validation.success ? validation.data.status : statusParam;

    const items = await invitationService.listInvitations(orgId, status);
    return sendResponse(res, StatusCodes.OK, true, "Invitations retrieved successfully", items);
  } catch (error) {
    console.error("listInvitations error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to retrieve invitations");
  }
}

/**
 * DELETE /api/orgs/:orgId/invitations/:invitationId
 * Maintainers only.
 */
export async function revokeInvitationController(
  req: OrgRequest,
  res: ServerResponse
) {
  try {
    const orgId = Number(req.params?.orgId);
    const invitationId = Number(req.params?.invitationId);

    await invitationService.revokeInvitation(orgId, invitationId);

    res.writeHead(StatusCodes.NO_CONTENT);
    res.end();
    return;
  } catch (error) {
    if (error instanceof invitationService.NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("revokeInvitation error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to revoke invitation");
  }
}

/**
 * POST /api/orgs/:orgId/invitations/:invitationId/resend
 * Maintainers only.
 */
export async function resendInvitationController(
  req: OrgRequest,
  res: ServerResponse
) {
  try {
    const orgId = Number(req.params?.orgId);
    const invitationId = Number(req.params?.invitationId);

    const result = await invitationService.resendInvitation(orgId, invitationId);
    return sendResponse(res, StatusCodes.OK, true, "Invitation resent successfully", result);
  } catch (error) {
    if (error instanceof invitationService.ConflictError) {
      return sendResponse(res, StatusCodes.CONFLICT, false, error.message);
    }
    if (error instanceof invitationService.NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("resendInvitation error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to resend invitation");
  }
}

/**
 * GET /api/invitations/:token
 * Public endpoint.
 */
export async function getInvitationByTokenController(
  req: IncomingMessage,
  res: ServerResponse
) {
  try {
    const url = req.url || "";
    const pathname = url.split("?")[0] || "";
    const parts = pathname.split("/");
    const token = parts[3] || "";

    if (!token) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invitation token is required");
    }

    const invitation = await invitationService.getInvitationByToken(token);
    return sendResponse(res, StatusCodes.OK, true, "Invitation details retrieved", invitation);
  } catch (error) {
    if (error instanceof invitationService.ExpiredError) {
      return sendResponse(res, StatusCodes.GONE, false, error.message);
    }
    console.error("getInvitationByToken error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to retrieve invitation");
  }
}

/**
 * POST /api/invitations/:token/accept
 * User (authenticated).
 */
export async function acceptInvitationController(
  req: OrgRequest,
  res: ServerResponse
) {
  try {
    const url = req.url || "";
    const pathname = url.split("?")[0] || "";
    const parts = pathname.split("/");
    // URL pattern: /api/invitations/:token/accept
    const token = parts[3] || "";

    if (!token) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invitation token is required");
    }

    let userEmail = req.user!.email;
    if (!userEmail) {
      const userRes = await pool.query("SELECT email FROM users WHERE id = $1", [req.user!.id]);
      userEmail = userRes.rows[0]?.email;
    }

    if (!userEmail) {
      return sendResponse(res, StatusCodes.UNAUTHORIZED, false, "User not found");
    }

    const result = await invitationService.acceptInvitation(token, {
      id: req.user!.id,
      email: userEmail,
    });
    return sendResponse(res, StatusCodes.OK, true, "Invitation accepted successfully", result);
  } catch (error) {
    if (error instanceof invitationService.ForbiddenError) {
      return sendResponse(res, StatusCodes.FORBIDDEN, false, error.message);
    }
    if (error instanceof invitationService.ExpiredError) {
      return sendResponse(res, StatusCodes.GONE, false, error.message);
    }
    console.error("acceptInvitation error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to accept invitation");
  }
}

/**
 * GET /api/invitations/my-pending
 * Lists all active invitations matching authenticated user's email.
 */
export async function listMyPendingInvitationsController(
  req: OrgRequest,
  res: ServerResponse
) {
  try {
    let userEmail = req.user!.email;
    if (!userEmail) {
      const userRes = await pool.query("SELECT email FROM users WHERE id = $1", [req.user!.id]);
      userEmail = userRes.rows[0]?.email;
    }

    if (!userEmail) {
      return sendResponse(res, StatusCodes.UNAUTHORIZED, false, "User not found");
    }

    const items = await invitationService.listMyPendingInvitations(userEmail);
    return sendResponse(res, StatusCodes.OK, true, "Pending invitations retrieved successfully", items);
  } catch (error) {
    console.error("listMyPendingInvitations error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to retrieve invitations");
  }
}

/**
 * POST /api/invitations/:invitationId/accept-mine
 * Directly accepts a pending invite by ID for authenticated matching user.
 */
export async function acceptMyInvitationController(
  req: OrgRequest,
  res: ServerResponse
) {
  try {
    const url = req.url || "";
    const pathname = url.split("?")[0] || "";
    const parts = pathname.split("/");
    const invitationId = Number(parts[3]);

    if (isNaN(invitationId) || invitationId <= 0) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invalid invitation ID");
    }

    let userEmail = req.user!.email;
    if (!userEmail) {
      const userRes = await pool.query("SELECT email FROM users WHERE id = $1", [req.user!.id]);
      userEmail = userRes.rows[0]?.email;
    }

    if (!userEmail) {
      return sendResponse(res, StatusCodes.UNAUTHORIZED, false, "User not found");
    }

    const result = await invitationService.acceptInvitationById(invitationId, {
      id: req.user!.id,
      email: userEmail,
    });
    return sendResponse(res, StatusCodes.OK, true, "Invitation accepted successfully", result);
  } catch (error) {
    if (error instanceof invitationService.ForbiddenError) {
      return sendResponse(res, StatusCodes.FORBIDDEN, false, error.message);
    }
    if (error instanceof invitationService.ExpiredError) {
      return sendResponse(res, StatusCodes.GONE, false, error.message);
    }
    console.error("acceptMyInvitation error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to accept invitation");
  }
}
