import type { ServerResponse } from "http";
import { parseBody } from "../utility/parseBody";
import { sendResponse } from "../utility/sendResponse";
import * as attachmentService from "../service/attachment.service";
import * as issueService from "../service/issue.service";
import { pool } from "../database/db";
import { StatusCodes } from "http-status-codes";
import type { OrgRequest } from "../types/org.type";
import { validateSchema } from "../validation";
import {
  signAttachmentSchema,
  registerAttachmentSchema,
} from "../validation/attachment.schema";

/**
 * Checks whether user has permission to upload / view attachments for this issue.
 * Maintainers: yes.
 * Contributors: yes, if approved on project.
 * Guests: only if reporter of the issue.
 */
async function checkIssueAttachmentAccess(
  req: OrgRequest,
  orgId: number,
  issueId: number
): Promise<{ allowed: boolean; status: number; message: string; issue?: any }> {
  const issue = await issueService.getSingleIssue(orgId, issueId);
  if (!issue) {
    return { allowed: false, status: StatusCodes.NOT_FOUND, message: "Issue not found" };
  }

  const isMaintainer =
    req.orgRole === "owner" ||
    req.orgRole === "admin" ||
    !!req.actingAsSuperAdmin;

  if (isMaintainer) {
    return { allowed: true, status: StatusCodes.OK, message: "", issue };
  }

  if (req.orgRole === "guest") {
    if (issue.reporter.id !== req.user!.id) {
      return {
        allowed: false,
        status: StatusCodes.FORBIDDEN,
        message: "Clients can only attach files to their own issues",
      };
    }
    return { allowed: true, status: StatusCodes.OK, message: "", issue };
  }

  // Contributor / Member: check project membership
  const pmRes = await pool.query(
    "SELECT status, role FROM project_members WHERE project_id = $1 AND user_id = $2",
    [issue.project_id, req.user!.id]
  );

  if (pmRes.rows.length === 0 || pmRes.rows[0].status !== "approved") {
    return {
      allowed: false,
      status: StatusCodes.FORBIDDEN,
      message: "You do not have access to this project",
    };
  }

  return { allowed: true, status: StatusCodes.OK, message: "", issue };
}

/**
 * POST /api/orgs/:orgId/issues/:issueId/attachments/sign
 */
export async function signAttachmentController(
  req: OrgRequest,
  res: ServerResponse
) {
  try {
    const orgId = Number(req.params?.orgId);
    const issueId = Number(req.params?.issueId);

    if (isNaN(orgId) || isNaN(issueId)) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invalid orgId or issueId");
    }

    const access = await checkIssueAttachmentAccess(req, orgId, issueId);
    if (!access.allowed) {
      return sendResponse(res, access.status, false, access.message);
    }

    const rawBody = await parseBody(req);
    const validation = validateSchema(signAttachmentSchema, rawBody);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }

    const signedData = await attachmentService.generateUploadSignature(
      orgId,
      issueId,
      validation.data
    );

    return sendResponse(
      res,
      StatusCodes.OK,
      true,
      "Attachment signature generated successfully",
      signedData
    );
  } catch (error: any) {
    if (error instanceof attachmentService.ValidationError) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, error.message);
    }
    console.error("signAttachmentController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to generate upload signature"
    );
  }
}

/**
 * POST /api/orgs/:orgId/issues/:issueId/attachments
 */
export async function createAttachmentController(
  req: OrgRequest,
  res: ServerResponse
) {
  try {
    const orgId = Number(req.params?.orgId);
    const issueId = Number(req.params?.issueId);

    if (isNaN(orgId) || isNaN(issueId)) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invalid orgId or issueId");
    }

    const access = await checkIssueAttachmentAccess(req, orgId, issueId);
    if (!access.allowed) {
      return sendResponse(res, access.status, false, access.message);
    }

    const rawBody = await parseBody(req);
    const validation = validateSchema(registerAttachmentSchema, rawBody);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }

    const attachment = await attachmentService.saveAttachment(
      orgId,
      issueId,
      req.user!.id,
      validation.data,
      !!req.actingAsSuperAdmin
    );

    return sendResponse(
      res,
      StatusCodes.CREATED,
      true,
      "Attachment created successfully",
      attachment
    );
  } catch (error: any) {
    if (error instanceof attachmentService.ValidationError) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, error.message);
    }
    if (error instanceof attachmentService.NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("createAttachmentController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to save attachment"
    );
  }
}

/**
 * DELETE /api/orgs/:orgId/attachments/:attachmentId
 */
export async function deleteAttachmentController(
  req: OrgRequest,
  res: ServerResponse
) {
  try {
    const orgId = Number(req.params?.orgId);
    const attachmentId = Number(req.params?.attachmentId);

    if (isNaN(orgId) || isNaN(attachmentId)) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invalid orgId or attachmentId");
    }

    const isMaintainer =
      req.orgRole === "owner" ||
      req.orgRole === "admin" ||
      !!req.actingAsSuperAdmin;

    await attachmentService.deleteAttachment(
      orgId,
      attachmentId,
      req.user!.id,
      isMaintainer,
      !!req.actingAsSuperAdmin
    );

    res.writeHead(StatusCodes.NO_CONTENT);
    res.end();
  } catch (error: any) {
    if (error instanceof attachmentService.NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    if (error instanceof attachmentService.ForbiddenError) {
      return sendResponse(res, StatusCodes.FORBIDDEN, false, error.message);
    }
    console.error("deleteAttachmentController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to delete attachment"
    );
  }
}

