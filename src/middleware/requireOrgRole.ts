import type { ServerResponse } from "http";
import { sendResponse } from "../utility/sendResponse";
import { StatusCodes } from "http-status-codes";
import type { OrgRequest, OrgRole } from "../types/org.type";

/**
 * Checks whether the caller's org role matches one of the required roles.
 * Returns 403 if role is insufficient.
 */
export function requireOrgRole(
  req: OrgRequest,
  res: ServerResponse,
  ...allowedRoles: OrgRole[]
): boolean {
  if (!req.orgRole || !allowedRoles.includes(req.orgRole)) {
    sendResponse(
      res,
      StatusCodes.FORBIDDEN,
      false,
      `Access denied. Requires ${allowedRoles.join(" or ")} role.`
    );
    return false;
  }
  return true;
}

