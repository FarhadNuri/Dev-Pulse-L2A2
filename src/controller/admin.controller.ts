import type { ServerResponse } from "http";
import { parseBody } from "../utility/parseBody";
import { sendResponse } from "../utility/sendResponse";
import * as adminService from "../service/admin.service";
import { StatusCodes } from "http-status-codes";
import type { AuthRequest } from "../middleware/auth";
import { validateSchema } from "../validation";
import {
  adminOrgsQuerySchema,
  adminUsersQuerySchema,
  updateOrgStatusSchema,
  deleteOrgSchema,
  updateUserStatusSchema,
  updateSuperAdminSchema,
} from "../validation/admin.schema";

function extractIdFromUrl(url: string | undefined, index: number = 4): number {
  const pathname = (url || "").split("?")[0] || "";
  const parts = pathname.split("/");
  const val = parts[index];
  return val ? Number(val) : NaN;
}

/**
 * GET /api/admin/stats
 */
export async function getAdminStatsController(
  _req: AuthRequest,
  res: ServerResponse
) {
  try {
    const stats = await adminService.getStats();
    return sendResponse(res, StatusCodes.OK, true, "Admin stats retrieved", stats);
  } catch (error) {
    console.error("getAdminStatsController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to retrieve stats"
    );
  }
}

/**
 * GET /api/admin/orgs
 */
export async function listAdminOrgsController(
  req: AuthRequest,
  res: ServerResponse
) {
  try {
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const queryObj = Object.fromEntries(url.searchParams.entries());

    const validation = validateSchema(adminOrgsQuerySchema, queryObj);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }

    const result = await adminService.listOrgs(validation.data);
    return sendResponse(
      res,
      StatusCodes.OK,
      true,
      "Organizations retrieved",
      result
    );
  } catch (error) {
    console.error("listAdminOrgsController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to list organizations"
    );
  }
}

/**
 * GET /api/admin/orgs/:orgId
 */
export async function getAdminOrgDetailsController(
  req: AuthRequest,
  res: ServerResponse
) {
  try {
    const orgId = extractIdFromUrl(req.url, 4);

    if (isNaN(orgId) || orgId <= 0) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invalid organization ID");
    }

    const details = await adminService.getOrgDetails(orgId);
    return sendResponse(
      res,
      StatusCodes.OK,
      true,
      "Organization details retrieved",
      details
    );
  } catch (error: any) {
    if (error instanceof adminService.NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("getAdminOrgDetailsController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to retrieve organization details"
    );
  }
}

/**
 * PATCH /api/admin/orgs/:orgId/status
 */
export async function updateAdminOrgStatusController(
  req: AuthRequest,
  res: ServerResponse
) {
  try {
    const orgId = extractIdFromUrl(req.url, 4);

    if (isNaN(orgId) || orgId <= 0) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invalid organization ID");
    }

    const rawBody = await parseBody(req);
    const validation = validateSchema(updateOrgStatusSchema, rawBody);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }

    const updated = await adminService.updateOrgStatus(
      orgId,
      validation.data.status,
      req.user!.id
    );

    return sendResponse(
      res,
      StatusCodes.OK,
      true,
      "Organization status updated",
      updated
    );
  } catch (error: any) {
    if (error instanceof adminService.NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("updateAdminOrgStatusController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to update organization status"
    );
  }
}

/**
 * DELETE /api/admin/orgs/:orgId
 */
export async function deleteAdminOrgController(
  req: AuthRequest,
  res: ServerResponse
) {
  try {
    const orgId = extractIdFromUrl(req.url, 4);

    if (isNaN(orgId) || orgId <= 0) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invalid organization ID");
    }

    const rawBody = await parseBody(req);
    const validation = validateSchema(deleteOrgSchema, rawBody);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }

    await adminService.deleteOrg(orgId, validation.data.confirm_name, req.user!.id);

    res.writeHead(StatusCodes.NO_CONTENT);
    res.end();
  } catch (error: any) {
    if (error instanceof adminService.NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    if (error instanceof adminService.ValidationError) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, error.message);
    }
    console.error("deleteAdminOrgController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to delete organization"
    );
  }
}

/**
 * GET /api/admin/users
 */
export async function listAdminUsersController(
  req: AuthRequest,
  res: ServerResponse
) {
  try {
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const queryObj = Object.fromEntries(url.searchParams.entries());

    const validation = validateSchema(adminUsersQuerySchema, queryObj);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }

    const result = await adminService.listUsers(validation.data);
    return sendResponse(res, StatusCodes.OK, true, "Users retrieved", result);
  } catch (error) {
    console.error("listAdminUsersController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to list users"
    );
  }
}

/**
 * GET /api/admin/users/:userId
 */
export async function getAdminUserDetailsController(
  req: AuthRequest,
  res: ServerResponse
) {
  try {
    const userId = extractIdFromUrl(req.url, 4);

    if (isNaN(userId) || userId <= 0) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invalid user ID");
    }

    const details = await adminService.getUserDetails(userId);
    return sendResponse(
      res,
      StatusCodes.OK,
      true,
      "User details retrieved",
      details
    );
  } catch (error: any) {
    if (error instanceof adminService.NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    console.error("getAdminUserDetailsController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to retrieve user details"
    );
  }
}

/**
 * PATCH /api/admin/users/:userId/status
 */
export async function updateAdminUserStatusController(
  req: AuthRequest,
  res: ServerResponse
) {
  try {
    const userId = extractIdFromUrl(req.url, 4);

    if (isNaN(userId) || userId <= 0) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invalid user ID");
    }

    const rawBody = await parseBody(req);
    const validation = validateSchema(updateUserStatusSchema, rawBody);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }

    const updated = await adminService.updateUserStatus(
      userId,
      validation.data.status,
      req.user!.id
    );

    return sendResponse(res, StatusCodes.OK, true, "User status updated", updated);
  } catch (error: any) {
    if (error instanceof adminService.NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    if (error instanceof adminService.ConflictError) {
      return sendResponse(res, StatusCodes.CONFLICT, false, error.message);
    }
    console.error("updateAdminUserStatusController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to update user status"
    );
  }
}

/**
 * PATCH /api/admin/users/:userId/super-admin
 */
export async function updateAdminSuperAdminController(
  req: AuthRequest,
  res: ServerResponse
) {
  try {
    const userId = extractIdFromUrl(req.url, 4);

    if (isNaN(userId) || userId <= 0) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invalid user ID");
    }

    const rawBody = await parseBody(req);
    const validation = validateSchema(updateSuperAdminSchema, rawBody);
    if (!validation.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, validation.error);
    }

    const updated = await adminService.updateSuperAdmin(
      userId,
      validation.data.value,
      req.user!.id
    );

    return sendResponse(
      res,
      StatusCodes.OK,
      true,
      "Super admin privilege updated",
      updated
    );
  } catch (error: any) {
    if (error instanceof adminService.NotFoundError) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, error.message);
    }
    if (error instanceof adminService.ConflictError) {
      return sendResponse(res, StatusCodes.CONFLICT, false, error.message);
    }
    console.error("updateAdminSuperAdminController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to update super admin privilege"
    );
  }
}

/**
 * GET /api/admin/projects
 */
export async function listAdminProjectsController(
  req: AuthRequest,
  res: ServerResponse
) {
  try {
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const search = url.searchParams.get("search") || undefined;
    const page = Number(url.searchParams.get("page")) || 1;
    const limit = Number(url.searchParams.get("limit")) || 50;

    const result = await adminService.listAllProjects({ search, page, limit });
    return sendResponse(res, StatusCodes.OK, true, "Projects retrieved", result);
  } catch (error) {
    console.error("listAdminProjectsController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to retrieve projects"
    );
  }
}

/**
 * GET /api/admin/issues
 */
export async function listAdminIssuesController(
  req: AuthRequest,
  res: ServerResponse
) {
  try {
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const search = url.searchParams.get("search") || undefined;
    const approvalStatus = url.searchParams.get("approval_status") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const page = Number(url.searchParams.get("page")) || 1;
    const limit = Number(url.searchParams.get("limit")) || 50;

    const result = await adminService.listAllIssues({
      search,
      approvalStatus,
      status,
      page,
      limit,
    });
    return sendResponse(res, StatusCodes.OK, true, "Issues retrieved", result);
  } catch (error) {
    console.error("listAdminIssuesController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to retrieve issues"
    );
  }
}
