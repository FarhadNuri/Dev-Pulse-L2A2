import type { ServerResponse } from "http";
import { sendResponse } from "../utility/sendResponse";
import { StatusCodes } from "http-status-codes";
import type { AuthRequest } from "./auth";

/**
 * Validates that the authenticated user is a platform super admin (users.is_super_admin = true).
 * Non-super-admins receive 403 Forbidden.
 */
export function requireSuperAdmin(req: AuthRequest, res: ServerResponse): boolean {
  if (!req.user || !req.user.id) {
    sendResponse(res, StatusCodes.UNAUTHORIZED, false, "Authentication required");
    return false;
  }

  if (!req.user.is_super_admin) {
    sendResponse(res, StatusCodes.FORBIDDEN, false, "Forbidden: Super admin access required");
    return false;
  }

  return true;
}

