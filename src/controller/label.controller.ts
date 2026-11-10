import type { ServerResponse } from "http";
import { StatusCodes } from "http-status-codes";
import { parseBody } from "../utility/parseBody";
import { sendResponse } from "../utility/sendResponse";
import type { OrgRequest } from "../types/org.type";
import { validateSchema } from "../validation";
import { createLabelSchema, updateLabelSchema } from "../validation/label.schema";
import * as labelService from "../service/label.service";
import { ConflictError, NotFoundError } from "../service/org.service";

/**
 * GET /api/orgs/:orgId/labels
 * Access: Member+ or Guest (all org users read)
 */
export async function listLabelsController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const labels = await labelService.listLabels(orgId);
    return sendResponse(res, StatusCodes.OK, true, "Labels retrieved successfully", labels);
  } catch (error) {
    console.error("listLabels error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to list labels");
  }
}

/**
 * POST /api/orgs/:orgId/labels
 * Access: Maintainer (owner, admin, super admin)
 */
export async function createLabelController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const rawBody = await parseBody(req);
    const validation = validateSchema(createLabelSchema, rawBody);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }

    const { name, color } = validation.data;
    const label = await labelService.createLabel(orgId, name, color);
    return sendResponse(res, StatusCodes.CREATED, true, "Label created successfully", label);
  } catch (error) {
    if (error instanceof ConflictError) {
      return sendResponse(res, StatusCodes.CONFLICT, false, error.message);
    }
    console.error("createLabel error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to create label");
  }
}

/**
 * PATCH /api/orgs/:orgId/labels/:labelId
 * Access: Maintainer
 */
export async function updateLabelController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const labelId = Number(req.params?.labelId);
    if (isNaN(labelId) || labelId <= 0) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invalid label ID");
    }

    const rawBody = await parseBody(req);
    const validation = validateSchema(updateLabelSchema, rawBody);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }

    const updated = await labelService.updateLabel(orgId, labelId, validation.data);
    return sendResponse(res, StatusCodes.OK, true, "Label updated successfully", updated);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    if (error instanceof ConflictError) {
      return sendResponse(res, StatusCodes.CONFLICT, false, error.message);
    }
    console.error("updateLabel error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to update label");
  }
}

/**
 * DELETE /api/orgs/:orgId/labels/:labelId
 * Access: Maintainer
 */
export async function deleteLabelController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const labelId = Number(req.params?.labelId);
    if (isNaN(labelId) || labelId <= 0) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invalid label ID");
    }

    await labelService.deleteLabel(orgId, labelId);
    res.writeHead(StatusCodes.NO_CONTENT);
    res.end();
    return;
  } catch (error) {
    if (error instanceof NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("deleteLabel error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to delete label");
  }
}

