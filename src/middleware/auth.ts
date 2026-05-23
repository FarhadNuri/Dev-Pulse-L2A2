import type { IncomingMessage, ServerResponse } from "http";
import { verifyToken } from "../utility/jwt";
import { sendResponse } from "../utility/sendResponse";
import { StatusCodes } from "http-status-codes";
import type { IJwtPayload } from "../types/user.type";

export interface AuthRequest extends IncomingMessage {
  user?: IJwtPayload;
}

export const verifyAuth = (req: AuthRequest, res: ServerResponse): boolean => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
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
    sendResponse(
      res,
      StatusCodes.UNAUTHORIZED,
      false,
      "Invalid or expired token",
    );
    return false;
  }

  req.user = decoded;
  return true;
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
