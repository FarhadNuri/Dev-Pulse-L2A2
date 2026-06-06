import type { ServerResponse } from "http";
import { parseBody } from "../utility/parseBody";
import { sendResponse } from "../utility/sendResponse";
import {
  createComment,
  getCommentsByIssueId,
  getCommentById,
  deleteComment,
} from "../service/comment.service";
import { getIssueById } from "../service/issue.service";
import { findUsersByIds } from "../service/user.service";
import { StatusCodes } from "http-status-codes";
import type { AuthRequest } from "../middleware/auth";
import type { ICreateCommentRequest } from "../types/comment.type";

export const getCommentsController = async (
  req: AuthRequest,
  res: ServerResponse,
  issueId: number,
) => {
  try {
    const issue = await getIssueById(issueId);
    if (!issue) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, "Issue not found");
    }

    const comments = await getCommentsByIssueId(issueId);
    const authorIds = [...new Set(comments.map((c) => c.author_id))];
    const authors = authorIds.length > 0 ? await findUsersByIds(authorIds) : [];

    const commentsWithAuthors = comments.map((comment) => {
      const author = authors.find((a) => a.id === comment.author_id);
      const { author_id, ...commentWithoutAuthorId } = comment;
      return {
        ...commentWithoutAuthorId,
        author: author
          ? { id: author.id, name: author.name, role: author.role }
          : { id: author_id, name: "Unknown", role: "unknown" },
      };
    });

    return sendResponse(
      res,
      StatusCodes.OK,
      true,
      "Comments retrieved successfully",
      commentsWithAuthors,
    );
  } catch (error) {
    console.error("Get comments error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Something went wrong!",
      undefined,
      error,
    );
  }
};

export const createCommentController = async (
  req: AuthRequest,
  res: ServerResponse,
  issueId: number,
) => {
  try {
    const body: ICreateCommentRequest = await parseBody(req);

    if (!body.body || body.body.trim().length === 0) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Comment body is required",
      );
    }

    if (body.body.length > 1000) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Comment must not exceed 1000 characters",
      );
    }

    const issue = await getIssueById(issueId);
    if (!issue) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, "Issue not found");
    }

    const authorId = req.user?.id;
    if (!authorId) {
      return sendResponse(
        res,
        StatusCodes.UNAUTHORIZED,
        false,
        "Authentication required",
      );
    }

    const newComment = await createComment(issueId, authorId, body.body.trim());
    const authors = await findUsersByIds([authorId]);
    const author = authors[0];

    const { author_id, ...commentWithoutAuthorId } = newComment;
    const commentWithAuthor = {
      ...commentWithoutAuthorId,
      author: author
        ? { id: author.id, name: author.name, role: author.role }
        : { id: author_id, name: "Unknown", role: "unknown" },
    };

    return sendResponse(
      res,
      StatusCodes.CREATED,
      true,
      "Comment created successfully",
      commentWithAuthor,
    );
  } catch (error) {
    console.error("Create comment error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Something went wrong!",
      undefined,
      error,
    );
  }
};

export const deleteCommentController = async (
  req: AuthRequest,
  res: ServerResponse,
  commentId: number,
) => {
  try {
    const comment = await getCommentById(commentId);
    if (!comment) {
      return sendResponse(
        res,
        StatusCodes.NOT_FOUND,
        false,
        "Comment not found",
      );
    }

    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return sendResponse(
        res,
        StatusCodes.UNAUTHORIZED,
        false,
        "Authentication required",
      );
    }


    if (userRole !== "maintainer" && comment.author_id !== userId) {
      return sendResponse(
        res,
        StatusCodes.FORBIDDEN,
        false,
        "You can only delete your own comments",
      );
    }

    await deleteComment(commentId);

    return sendResponse(
      res,
      StatusCodes.OK,
      true,
      "Comment deleted successfully",
    );
  } catch (error) {
    console.error("Delete comment error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Something went wrong!",
      undefined,
      error,
    );
  }
};
