import type { ServerResponse } from "http";
import { parseBody } from "../utility/parseBody";
import { sendResponse } from "../utility/sendResponse";
import * as commentService from "../service/comment.service";
import * as issueService from "../service/issue.service";
import { pool } from "../database/db";
import { StatusCodes } from "http-status-codes";
import type { OrgRequest } from "../types/org.type";
import { validateSchema } from "../validation";
import { createCommentSchema } from "../validation/comment.schema";

interface CreateCommentBody {
  body?: string;
}

/**
 * GET /api/orgs/:orgId/issues/:issueId/comments
 */
export async function getCommentsController(
  req: OrgRequest,
  res: ServerResponse,
) {
  try {
    const orgId = Number(req.params?.orgId);
    const issueId = Number(req.params?.issueId);

    if (isNaN(orgId) || isNaN(issueId)) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Invalid orgId or issueId",
      );
    }

    const issue = await issueService.getSingleIssue(orgId, issueId);
    if (!issue) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, "Issue not found");
    }

    // Permission check:
    // Maintainers have full access.
    // Guests can only view comments on their own issues.
    // Members require approved membership on the issue's project.
    const isMaintainer =
      req.orgRole === "owner" ||
      req.orgRole === "admin" ||
      !!req.actingAsSuperAdmin;

    if (!isMaintainer) {
      if (req.orgRole === "guest") {
        if (issue.reporter.id !== req.user!.id) {
          return sendResponse(
            res,
            StatusCodes.FORBIDDEN,
            false,
            "Guests can only view comments on their own issues",
          );
        }
      } else {
        const pmRes = await pool.query(
          "SELECT status FROM project_members WHERE project_id = $1 AND user_id = $2",
          [issue.project_id, req.user!.id],
        );
        if (pmRes.rows.length === 0 || pmRes.rows[0].status !== "approved") {
          return sendResponse(
            res,
            StatusCodes.FORBIDDEN,
            false,
            "You do not have access to this project's comments",
          );
        }
      }
    }

    const comments = await commentService.getCommentsByIssueId(issueId);

    return sendResponse(
      res,
      StatusCodes.OK,
      true,
      "Comments retrieved successfully",
      comments,
    );
  } catch (error) {
    console.error("getCommentsController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to retrieve comments",
    );
  }
}

/**
 * POST /api/orgs/:orgId/issues/:issueId/comments
 */
export async function createCommentController(
  req: OrgRequest,
  res: ServerResponse,
) {
  try {
    const orgId = Number(req.params?.orgId);
    const issueId = Number(req.params?.issueId);

    if (isNaN(orgId) || isNaN(issueId)) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Invalid orgId or issueId",
      );
    }

    const rawBody = await parseBody(req);
    const validation = validateSchema(createCommentSchema, rawBody);
    if (!validation.success) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        validation.error,
      );
    }
    const commentBody = validation.data.body;

    const issue = await issueService.getSingleIssue(orgId, issueId);
    if (!issue) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, "Issue not found");
    }

    // Permission check:
    const isMaintainer =
      req.orgRole === "owner" ||
      req.orgRole === "admin" ||
      !!req.actingAsSuperAdmin;

    if (!isMaintainer) {
      if (req.orgRole === "guest") {
        if (issue.reporter.id !== req.user!.id) {
          return sendResponse(
            res,
            StatusCodes.FORBIDDEN,
            false,
            "Guests can only comment on their own issues",
          );
        }
      } else {
        const pmRes = await pool.query(
          "SELECT status FROM project_members WHERE project_id = $1 AND user_id = $2",
          [issue.project_id, req.user!.id],
        );
        if (pmRes.rows.length === 0 || pmRes.rows[0].status !== "approved") {
          return sendResponse(
            res,
            StatusCodes.FORBIDDEN,
            false,
            "You do not have access to this project",
          );
        }
      }
    }

    const newComment = await commentService.createComment(
      issueId,
      req.user!.id,
      commentBody,
      validation.data.mentions,
      !!req.actingAsSuperAdmin
    );

    return sendResponse(
      res,
      StatusCodes.CREATED,
      true,
      "Comment created successfully",
      newComment,
    );
  } catch (error: any) {
    if (error instanceof commentService.ValidationError) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, error.message);
    }
    console.error("createCommentController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to create comment",
    );
  }
}

/**
 * GET /api/orgs/:orgId/projects/:projectId/mentionable
 */
export async function getMentionableUsersController(
  req: OrgRequest,
  res: ServerResponse,
) {
  try {
    const orgId = Number(req.params?.orgId);
    const projectId = Number(req.params?.projectId);

    if (isNaN(orgId) || isNaN(projectId)) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Invalid orgId or projectId",
      );
    }

    const mentionable = await commentService.getMentionableUsers(orgId, projectId);

    return sendResponse(
      res,
      StatusCodes.OK,
      true,
      "Mentionable users retrieved successfully",
      mentionable,
    );
  } catch (error) {
    console.error("getMentionableUsersController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to retrieve mentionable users",
    );
  }
}

/**
 * DELETE /api/orgs/:orgId/comments/:commentId
 */
export async function deleteCommentController(
  req: OrgRequest,
  res: ServerResponse,
) {
  try {
    const orgId = Number(req.params?.orgId);
    const commentId = Number(req.params?.commentId);

    if (isNaN(orgId) || isNaN(commentId)) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Invalid orgId or commentId",
      );
    }

    const comment = await commentService.getCommentWithOrg(commentId, orgId);
    if (!comment) {
      return sendResponse(
        res,
        StatusCodes.NOT_FOUND,
        false,
        "Comment not found",
      );
    }

    const isMaintainer =
      req.orgRole === "owner" ||
      req.orgRole === "admin" ||
      !!req.actingAsSuperAdmin;
    const isAuthor = comment.author_id === req.user!.id;

    if (!isMaintainer && !isAuthor) {
      return sendResponse(
        res,
        StatusCodes.FORBIDDEN,
        false,
        "You can only delete your own comments",
      );
    }

    await commentService.deleteComment(commentId, req.user!.id, !!req.actingAsSuperAdmin);

    res.writeHead(StatusCodes.NO_CONTENT);
    res.end();
    return;
  } catch (error) {
    console.error("deleteCommentController error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Failed to delete comment",
    );
  }
}
