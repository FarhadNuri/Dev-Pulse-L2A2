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
import {
  getCommentsController,
  createCommentController,
  deleteCommentController,
} from "../controller/comment.controller";
import {
  createProjectController,
  getProjectsController,
  getProjectByIdController,
} from "../controller/project.controller";
import {
  requestAccessController,
  listRequestsController,
  decideRequestController,
  listContributorsController,
  revokeContributorController,
} from "../controller/access.controller";
import {
  listMaintainersController,
  addMaintainerController,
} from "../controller/maintainer.controller";
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

    if (url.startsWith("/api/issues") && method === "GET" && !id) {
      const authReq = req as AuthRequest;
      verifyAuth(authReq, res, true);
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

    if (method === "GET" && id !== null && !isNaN(id) && url.includes("/comments")) {
      getCommentsController(req as AuthRequest, res, id);
      return;
    }

    if (method === "POST" && id !== null && !isNaN(id) && url.includes("/comments")) {
      const authReq = req as AuthRequest;
      if (!verifyAuth(authReq, res)) return;
      createCommentController(authReq, res, id);
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
      deleteIssueController(authReq, res, id);
      return;
    }
  }

  if (url?.startsWith("/api/comments")) {
    const urlParts = url.split("/");
    const commentId = urlParts[3] ? Number(urlParts[3].split("?")[0]) : null;

    if (method === "DELETE" && commentId !== null && !isNaN(commentId)) {
      const authReq = req as AuthRequest;
      if (!verifyAuth(authReq, res)) return;
      deleteCommentController(authReq, res, commentId);
      return;
    }
  }

  if (url?.startsWith("/api/projects")) {
    const urlParts = url.split("/");
    const id = urlParts[3] ? Number(urlParts[3].split("?")[0]) : null;

    if (url === "/api/projects" && method === "POST") {
      const authReq = req as AuthRequest;
      if (!verifyAuth(authReq, res)) return;
      if (!isMaintainer(authReq, res)) return;
      createProjectController(authReq, res);
      return;
    }

    if (url === "/api/projects" && method === "GET") {
      const authReq = req as AuthRequest;
      if (!verifyAuth(authReq, res)) return;
      getProjectsController(authReq, res);
      return;
    }

    if (method === "GET" && id !== null && !isNaN(id) && urlParts.length === 4) {
      const authReq = req as AuthRequest;
      if (!verifyAuth(authReq, res)) return;
      // pass req.params.id to the controller by attaching it
      (authReq as any).params = { id: id };
      getProjectByIdController(authReq, res);
      return;
    }

    if (id !== null && !isNaN(id) && urlParts.length >= 5) {
      const subRoute = urlParts[4].split("?")[0];
      const memberId = urlParts[5] ? Number(urlParts[5].split("?")[0]) : null;

      if (subRoute === "request-access" && method === "POST") {
        const authReq = req as AuthRequest;
        if (!verifyAuth(authReq, res)) return;
        (authReq as any).params = { id: id };
        requestAccessController(authReq, res);
        return;
      }

      if (subRoute === "access-requests" && method === "GET") {
        const authReq = req as AuthRequest;
        if (!verifyAuth(authReq, res)) return;
        (authReq as any).params = { id: id };
        listRequestsController(authReq, res);
        return;
      }

      if (subRoute === "access-requests" && method === "PATCH" && memberId !== null && !isNaN(memberId)) {
        const authReq = req as AuthRequest;
        if (!verifyAuth(authReq, res)) return;
        (authReq as any).params = { id: id, memberId: memberId };
        decideRequestController(authReq, res);
        return;
      }

      if (subRoute === "contributors" && method === "GET") {
        const authReq = req as AuthRequest;
        if (!verifyAuth(authReq, res)) return;
        (authReq as any).params = { id: id };
        listContributorsController(authReq, res);
        return;
      }

      if (subRoute === "contributors" && method === "PATCH" && memberId !== null && !isNaN(memberId) && urlParts[6]?.split("?")[0] === "revoke") {
        const authReq = req as AuthRequest;
        if (!verifyAuth(authReq, res)) return;
        (authReq as any).params = { id: id, memberId: memberId };
        revokeContributorController(authReq, res);
        return;
      }

      if (subRoute === "maintainers" && method === "GET") {
        const authReq = req as AuthRequest;
        if (!verifyAuth(authReq, res)) return;
        (authReq as any).params = { id: id };
        listMaintainersController(authReq, res);
        return;
      }

      if (subRoute === "maintainers" && method === "POST") {
        const authReq = req as AuthRequest;
        if (!verifyAuth(authReq, res)) return;
        (authReq as any).params = { id: id };
        addMaintainerController(authReq, res);
        return;
      }
    }
  }

  sendResponse(res, StatusCodes.NOT_FOUND, false, "Route not found!");
};