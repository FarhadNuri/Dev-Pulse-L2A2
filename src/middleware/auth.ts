import type { IncomingMessage, ServerResponse } from "http";
import { verifyToken } from "../utility/jwt";
import { sendResponse } from "../utility/sendResponse";
import { StatusCodes } from "http-status-codes";
import type { IJwtPayload } from "../types/user.type";
import { pool } from "../database/db";

export interface AuthRequest extends IncomingMessage {
  user?: IJwtPayload;
}

export const verifyAuth = async (
  req: AuthRequest,
  res: ServerResponse,
  optional: boolean = false, 
): Promise<boolean> => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    if (optional) return true; 
    sendResponse(
      res,
      StatusCodes.UNAUTHORIZED,
      false,
      "Authorization token is required",
    );
    return false;
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  const decoded = verifyToken(token);

  if (!decoded) {
    if (optional) return true; 
    sendResponse(
      res,
      StatusCodes.UNAUTHORIZED,
      false,
      "Invalid or expired token",
    );
    return false;
  }

  try {
    const userRes = await pool.query(
      "SELECT id, name, email, is_super_admin, status FROM users WHERE id = $1",
      [decoded.id]
    );

    if (userRes.rows.length === 0 || userRes.rows[0].status === "disabled") {
      if (optional) return true;
      sendResponse(
        res,
        StatusCodes.UNAUTHORIZED,
        false,
        "Account is disabled or does not exist",
      );
      return false;
    }

    const dbUser = userRes.rows[0];
    req.user = {
      ...decoded,
      name: dbUser.name || decoded.name,
      email: dbUser.email || decoded.email,
      is_super_admin: !!dbUser.is_super_admin,
      status: dbUser.status,
    };
    return true;
  } catch (err) {
    console.error("verifyAuth DB check error:", err);
    sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to authenticate user",
    );
    return false;
  }
};

export const isMaintainer = (req: AuthRequest, res: ServerResponse): boolean => {
  if (!req.user) {
    sendResponse(
      res,
      StatusCodes.UNAUTHORIZED,
      false,
      "Authentication required",
    );
    return false;
  }

  if (req.user.role !== "maintainer") {
    sendResponse(
      res,
      StatusCodes.FORBIDDEN,
      false,
      "Access denied. Maintainer role required",
    );
    return false;
  }

  return true;
};
