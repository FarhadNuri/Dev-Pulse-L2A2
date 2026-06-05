import type { IncomingMessage, ServerResponse } from "http";
import { signup, login } from "../controller/auth.controller";
import {
  createIssueController,
  getAllIssuesController,
  getSingleIssueController,
  updateIssueController,
  deleteIssueController,
  getPendingIssuesController,
  approveIssueController,
} from "../controller/issue.controller";
import { verifyAuth, isMaintainer, type AuthRequest } from "../middleware/auth";
import { sendResponse } from "../utility/sendResponse";
import { StatusCodes } from "http-status-codes";

export const routeHandler = (req: IncomingMessage, res: ServerResponse) => {
  const url = req.url;
  const method = req.method;

  if (url === "/" && method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        message: "Welcome to DevPulse API",
      }),
    );
    return;
  }

  if (url === "/api/auth/signup" && method === "POST") {
    signup(req, res);
    return;
  }

  if (url === "/api/auth/login" && method === "POST") {
    login(req, res);
    return;
  }

  if (url?.startsWith("/api/issues")) {
    const urlParts = url.split("/");
    const id = urlParts[3] ? Number(urlParts[3].split("?")[0]) : null;

    if (url.startsWith("/api/issues/pending") && method === "GET") {
      const authReq = req as AuthRequest;
      if (!verifyAuth(authReq, res)) return;
      if (!isMaintainer(authReq, res)) return;
      getPendingIssuesController(authReq, res);
      return;
    }

    // ← ONLY CHANGE: added verifyAuth with optional=true
    if (url.startsWith("/api/issues") && method === "GET" && !id) {
      const authReq = req as AuthRequest;
      verifyAuth(authReq, res, true); // optional auth — populates req.user if token exists
      getAllIssuesController(authReq, res);
      return;
    }

    if (url.includes("/approve") && method === "PATCH" && id !== null && !isNaN(id)) {
      const authReq = req as AuthRequest;
      if (!verifyAuth(authReq, res)) return;
      if (!isMaintainer(authReq, res)) return;
      approveIssueController(authReq, res, id);
      return;
    }

    if (method === "GET" && id !== null && !isNaN(id)) {
      getSingleIssueController(req as AuthRequest, res, id);
      return;
    }

    if (url === "/api/issues" && method === "POST") {
      const authReq = req as AuthRequest;
      if (!verifyAuth(authReq, res)) return;
      createIssueController(authReq, res);
      return;
    }

    if (method === "PATCH" && id !== null && !isNaN(id)) {
      const authReq = req as AuthRequest;
      if (!verifyAuth(authReq, res)) return;
      updateIssueController(authReq, res, id);
      return;
    }

    if (method === "DELETE" && id !== null && !isNaN(id)) {
      const authReq = req as AuthRequest;
      if (!verifyAuth(authReq, res)) return;
      if (!isMaintainer(authReq, res)) return;
      deleteIssueController(authReq, res, id);
      return;
    }
  }

  sendResponse(res, StatusCodes.NOT_FOUND, false, "Route not found!");
};