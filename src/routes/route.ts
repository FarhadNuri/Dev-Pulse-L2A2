import type { IncomingMessage, ServerResponse } from "http";
import { signup, login } from "../controller/auth.controller";
import {
  createIssueController,
  listIssuesController,
  getSingleIssueController,
  updateIssueController,
  deleteIssueController,
  listPendingIssuesController,
  decideIssueApprovalController,
  resubmitIssueController,
  getMyRequestsController,
} from "../controller/issue.controller";
import {
  getCommentsController,
  createCommentController,
  deleteCommentController,
  getMentionableUsersController,
} from "../controller/comment.controller";
import {
  signAttachmentController,
  createAttachmentController,
  deleteAttachmentController,
} from "../controller/attachment.controller";
import {
  createProjectController,
  listProjectsController,
  getProjectController,
  updateProjectController,
  archiveProjectController,
} from "../controller/project.controller";
import {
  listProjectActivityController,
  listIssueActivityController,
  listOrgActivityController,
} from "../controller/activity.controller";
import {
  requestAccessController,
  listRequestsController,
  decideRequestController,
  listProjectMembersController,
  addProjectMemberController,
  revokeProjectMemberController,
} from "../controller/access.controller";
import {
  createOrgController,
  listMyOrgsController,
  getOrgController,
  updateOrgController,
  listOrgMembersController,
  updateOrgMemberRoleController,
  removeOrgMemberController,
  transferOrgOwnershipController,
  getMeController,
} from "../controller/org.controller";
import {
  createOrgInvitationController,
  createClientInvitationController,
  listInvitationsController,
  revokeInvitationController,
  resendInvitationController,
  getInvitationByTokenController,
  acceptInvitationController,
  listMyPendingInvitationsController,
  acceptMyInvitationController,
} from "../controller/invitation.controller";
import {
  listLabelsController,
  createLabelController,
  updateLabelController,
  deleteLabelController,
} from "../controller/label.controller";
import {
  getAdminStatsController,
  listAdminOrgsController,
  getAdminOrgDetailsController,
  updateAdminOrgStatusController,
  deleteAdminOrgController,
  listAdminUsersController,
  getAdminUserDetailsController,
  updateAdminUserStatusController,
  updateAdminSuperAdminController,
  listAdminProjectsController,
  listAdminIssuesController,
} from "../controller/admin.controller";
import { verifyAuth } from "../middleware/auth";
import { requireSuperAdmin } from "../middleware/requireSuperAdmin";
import { requireProjectAccess } from "../middleware/requireProjectAccess";
import { requireOrgAccess } from "../middleware/requireOrgAccess";
import { requireOrgRole } from "../middleware/requireOrgRole";
import type { OrgRequest } from "../types/org.type";
import { sendResponse } from "../utility/sendResponse";
import { StatusCodes } from "http-status-codes";

export async function routeHandler(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || "";
  const pathname = url.split("?")[0] || "";
  const method = req.method;

  if (pathname === "/" && method === "GET") {
    sendResponse(res, StatusCodes.OK, true, "Welcome to DevPulse API");
    return;
  }

  if (pathname === "/api/auth/signup" && method === "POST") {
    signup(req, res);
    return;
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    login(req, res);
    return;
  }

  if (pathname === "/api/auth/me" && method === "GET") {
    const authReq = req as OrgRequest;
    if (!await verifyAuth(authReq, res)) return;
    await getMeController(authReq, res);
    return;
  }

  // -------------------------------------------------------------
  // Public & User Invitation Routes (/api/invitations/...)
  // -------------------------------------------------------------
  if (pathname.startsWith("/api/invitations/")) {
    const urlParts = pathname.split("/");

    // GET /api/invitations/my-pending (Authenticated user)
    if (pathname === "/api/invitations/my-pending" && method === "GET") {
      const authReq = req as OrgRequest;
      if (!await verifyAuth(authReq, res)) return;
      await listMyPendingInvitationsController(authReq, res);
      return;
    }

    // POST /api/invitations/:invitationId/accept-mine (Authenticated user)
    if (urlParts.length === 5 && urlParts[4] === "accept-mine" && method === "POST") {
      const authReq = req as OrgRequest;
      if (!await verifyAuth(authReq, res)) return;
      await acceptMyInvitationController(authReq, res);
      return;
    }

    const token = urlParts[3];

    if (!token) {
      sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invitation token is required");
      return;
    }

    // GET /api/invitations/:token (Public)
    if (urlParts.length === 4 && method === "GET") {
      await getInvitationByTokenController(req, res);
      return;
    }

    // POST /api/invitations/:token/accept (User)
    if (urlParts.length === 5 && urlParts[4] === "accept" && method === "POST") {
      const authReq = req as OrgRequest;
      if (!await verifyAuth(authReq, res)) return;
      await acceptInvitationController(authReq, res);
      return;
    }
  }

  // -------------------------------------------------------------
  // Organization Routes (/api/orgs)
  // -------------------------------------------------------------
  // Static Org Routes (matched before param paths)
  if (pathname === "/api/orgs" && method === "POST") {
    const authReq = req as OrgRequest;
    if (!await verifyAuth(authReq, res)) return;
    createOrgController(authReq, res);
    return;
  }

  if (pathname === "/api/orgs" && method === "GET") {
    const authReq = req as OrgRequest;
    if (!await verifyAuth(authReq, res)) return;
    listMyOrgsController(authReq, res);
    return;
  }

  // Parameterized Org Routes (/api/orgs/:orgId/...)
  if (pathname.startsWith("/api/orgs/")) {
    const urlParts = pathname.split("/");
    const orgId = Number(urlParts[3]);

    if (isNaN(orgId) || orgId <= 0) {
      sendResponse(res, StatusCodes.NOT_FOUND, false, "Organization not found");
      return;
    }

    const authReq = req as OrgRequest;
    if (!await verifyAuth(authReq, res)) return;

    const hasOrgAccess = await requireOrgAccess(authReq, res, orgId);
    if (!hasOrgAccess) return;

    authReq.params = { ...(authReq.params || {}), orgId };

    // /api/orgs/:orgId
    if (urlParts.length === 4) {
      if (method === "GET") {
        getOrgController(authReq, res);
        return;
      }
      if (method === "PATCH") {
        if (!requireOrgRole(authReq, res, "owner")) return;
        updateOrgController(authReq, res);
        return;
      }
    }

    // Subroutes under /api/orgs/:orgId/...
    if (urlParts.length >= 5) {
      const subRoute = urlParts[4];

      // POST /api/orgs/:orgId/transfer-ownership
      if (subRoute === "transfer-ownership" && method === "POST" && urlParts.length === 5) {
        if (!requireOrgRole(authReq, res, "owner")) return;
        transferOrgOwnershipController(authReq, res);
        return;
      }

      // GET /api/orgs/:orgId/my-requests
      if (subRoute === "my-requests" && method === "GET" && urlParts.length === 5) {
        getMyRequestsController(authReq, res);
        return;
      }

      // /api/orgs/:orgId/labels...
      if (subRoute === "labels") {
        if (urlParts.length === 5) {
          if (method === "GET") {
            listLabelsController(authReq, res);
            return;
          }
          if (method === "POST") {
            if (!requireOrgRole(authReq, res, "owner", "admin")) return;
            createLabelController(authReq, res);
            return;
          }
        }

        if (urlParts.length === 6) {
          const labelId = Number(urlParts[5]);
          if (isNaN(labelId) || labelId <= 0) {
            sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invalid label ID");
            return;
          }
          authReq.params.labelId = labelId;

          if (method === "PATCH") {
            if (!requireOrgRole(authReq, res, "owner", "admin")) return;
            updateLabelController(authReq, res);
            return;
          }
          if (method === "DELETE") {
            if (!requireOrgRole(authReq, res, "owner", "admin")) return;
            deleteLabelController(authReq, res);
            return;
          }
        }
      }

      // /api/orgs/:orgId/members...
      if (subRoute === "members") {
        if (urlParts.length === 5 && method === "GET") {
          if (!requireOrgRole(authReq, res, "owner", "admin")) return;
          listOrgMembersController(authReq, res);
          return;
        }

        if (urlParts.length === 6) {
          const targetUserId = Number(urlParts[5]);
          if (isNaN(targetUserId) || targetUserId <= 0) {
            sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invalid user ID");
            return;
          }
          authReq.params.userId = targetUserId;

          if (method === "PATCH") {
            if (!requireOrgRole(authReq, res, "owner")) return;
            updateOrgMemberRoleController(authReq, res);
            return;
          }

          if (method === "DELETE") {
            removeOrgMemberController(authReq, res);
            return;
          }
        }
      }

      // /api/orgs/:orgId/invitations...
      if (subRoute === "invitations") {
        if (urlParts.length === 5) {
          if (method === "GET") {
            if (!requireOrgRole(authReq, res, "owner", "admin")) return;
            await listInvitationsController(authReq, res);
            return;
          }
          if (method === "POST") {
            if (!requireOrgRole(authReq, res, "owner", "admin")) return;
            await createOrgInvitationController(authReq, res);
            return;
          }
        }

        if (urlParts.length === 6) {
          const invitationId = Number(urlParts[5]);
          if (isNaN(invitationId) || invitationId <= 0) {
            sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invalid invitation ID");
            return;
          }
          authReq.params.invitationId = invitationId;

          if (method === "DELETE") {
            if (!requireOrgRole(authReq, res, "owner", "admin")) return;
            await revokeInvitationController(authReq, res);
            return;
          }
        }

        if (urlParts.length === 7 && urlParts[6] === "resend" && method === "POST") {
          const invitationId = Number(urlParts[5]);
          if (isNaN(invitationId) || invitationId <= 0) {
            sendResponse(res, StatusCodes.BAD_REQUEST, false, "Invalid invitation ID");
            return;
          }
          authReq.params.invitationId = invitationId;

          if (!requireOrgRole(authReq, res, "owner", "admin")) return;
          await resendInvitationController(authReq, res);
          return;
        }
      }

      // /api/orgs/:orgId/projects...
      if (subRoute === "projects") {
        if (urlParts.length === 5) {
          if (method === "GET") {
            listProjectsController(authReq, res);
            return;
          }
          if (method === "POST") {
            if (!requireOrgRole(authReq, res, "owner", "admin")) return;
            createProjectController(authReq, res);
            return;
          }
        }

        if (urlParts.length === 6) {
          const projectId = Number(urlParts[5]);
          if (isNaN(projectId) || projectId <= 0) {
            sendResponse(res, StatusCodes.NOT_FOUND, false, "Project not found");
            return;
          }
          authReq.params.projectId = projectId;

          if (method === "GET") {
            getProjectController(authReq, res);
            return;
          }
          if (method === "PATCH") {
            if (!requireOrgRole(authReq, res, "owner", "admin")) return;
            updateProjectController(authReq, res);
            return;
          }
        }

        if (urlParts.length >= 7) {
          const projectId = Number(urlParts[5]);
          if (isNaN(projectId) || projectId <= 0) {
            sendResponse(res, StatusCodes.NOT_FOUND, false, "Project not found");
            return;
          }
          authReq.params.projectId = projectId;
          const projectSubRoute = urlParts[6];

          // PATCH /api/orgs/:orgId/projects/:projectId/archive
          if (projectSubRoute === "archive" && urlParts.length === 7 && method === "PATCH") {
            if (!requireOrgRole(authReq, res, "owner", "admin")) return;
            archiveProjectController(authReq, res);
            return;
          }

          // GET /api/orgs/:orgId/projects/:projectId/activity
          if (projectSubRoute === "activity" && urlParts.length === 7 && method === "GET") {
            const hasAccess = await requireProjectAccess(authReq, res, projectId);
            if (!hasAccess) return;
            listProjectActivityController(authReq, res);
            return;
          }

          // GET /api/orgs/:orgId/projects/:projectId/mentionable
          if (projectSubRoute === "mentionable" && urlParts.length === 7 && method === "GET") {
            const hasAccess = await requireProjectAccess(authReq, res, projectId);
            if (!hasAccess) return;
            getMentionableUsersController(authReq, res);
            return;
          }

          // POST /api/orgs/:orgId/projects/:projectId/request-access
          if (projectSubRoute === "request-access" && method === "POST" && urlParts.length === 7) {
            requestAccessController(authReq, res);
            return;
          }

          // /api/orgs/:orgId/projects/:projectId/access-requests...
          if (projectSubRoute === "access-requests") {
            if (urlParts.length === 7 && method === "GET") {
              if (!requireOrgRole(authReq, res, "owner", "admin")) return;
              listRequestsController(authReq, res);
              return;
            }
            if (urlParts.length === 8 && method === "PATCH") {
              if (!requireOrgRole(authReq, res, "owner", "admin")) return;
              const memberId = Number(urlParts[7]);
              authReq.params.memberId = memberId;
              decideRequestController(authReq, res);
              return;
            }
          }

          // /api/orgs/:orgId/projects/:projectId/members...
          if (projectSubRoute === "members") {
            if (urlParts.length === 7) {
              if (method === "GET") {
                listProjectMembersController(authReq, res);
                return;
              }
              if (method === "POST") {
                if (!requireOrgRole(authReq, res, "owner", "admin")) return;
                addProjectMemberController(authReq, res);
                return;
              }
            }
            if (urlParts.length === 9 && urlParts[8] === "revoke" && method === "PATCH") {
              if (!requireOrgRole(authReq, res, "owner", "admin")) return;
              const memberId = Number(urlParts[7]);
              authReq.params.memberId = memberId;
              revokeProjectMemberController(authReq, res);
              return;
            }
          }

          // /api/orgs/:orgId/projects/:projectId/issues...
          if (projectSubRoute === "issues" && urlParts.length === 7) {
            const hasAccess = await requireProjectAccess(authReq, res, projectId);
            if (!hasAccess) return;

            if (method === "GET") {
              listIssuesController(authReq, res);
              return;
            }
            if (method === "POST") {
              createIssueController(authReq, res);
              return;
            }
          }

          // /api/orgs/:orgId/projects/:projectId/invitations...
          if (projectSubRoute === "invitations" && urlParts.length === 7 && method === "POST") {
            if (!requireOrgRole(authReq, res, "owner", "admin")) return;
            await createClientInvitationController(authReq, res);
            return;
          }
        }
      }

      // /api/orgs/:orgId/issues...
      if (subRoute === "issues") {
        // IMPORTANT: pending registered before :issueId
        if (urlParts.length === 6 && urlParts[5] === "pending" && method === "GET") {
          if (!requireOrgRole(authReq, res, "owner", "admin")) return;
          listPendingIssuesController(authReq, res);
          return;
        }

        const issueId = Number(urlParts[5]);
        if (!isNaN(issueId) && issueId > 0) {
          authReq.params.issueId = issueId;

          if (urlParts.length === 6) {
            if (method === "GET") {
              getSingleIssueController(authReq, res);
              return;
            }
            if (method === "PATCH") {
              updateIssueController(authReq, res);
              return;
            }
            if (method === "DELETE") {
              deleteIssueController(authReq, res);
              return;
            }
          }

          if (urlParts.length === 7) {
            const issueSubRoute = urlParts[6];

            if (issueSubRoute === "activity" && method === "GET") {
              listIssueActivityController(authReq, res);
              return;
            }

            if (issueSubRoute === "approve" && method === "PATCH") {
              if (!requireOrgRole(authReq, res, "owner", "admin")) return;
              decideIssueApprovalController(authReq, res);
              return;
            }

            if (issueSubRoute === "resubmit" && method === "POST") {
              resubmitIssueController(authReq, res);
              return;
            }

            if (issueSubRoute === "comments") {
              if (method === "GET") {
                getCommentsController(authReq, res);
                return;
              }
              if (method === "POST") {
                createCommentController(authReq, res);
                return;
              }
            }

            if (issueSubRoute === "attachments" && method === "POST") {
              createAttachmentController(authReq, res);
              return;
            }
          }

          if (urlParts.length === 8) {
            const issueSubRoute = urlParts[6];
            const issueAction = urlParts[7];

            if (issueSubRoute === "attachments" && issueAction === "sign" && method === "POST") {
              signAttachmentController(authReq, res);
              return;
            }
          }
        }
      }

      // /api/orgs/:orgId/activity
      if (subRoute === "activity" && urlParts.length === 5 && method === "GET") {
        listOrgActivityController(authReq, res);
        return;
      }

      // /api/orgs/:orgId/attachments/:attachmentId
      if (subRoute === "attachments" && urlParts.length === 6) {
        const attachmentId = Number(urlParts[5]);
        if (!isNaN(attachmentId) && attachmentId > 0) {
          authReq.params.attachmentId = attachmentId;
          if (method === "DELETE") {
            deleteAttachmentController(authReq, res);
            return;
          }
        }
      }

      // /api/orgs/:orgId/comments/:commentId
      if (subRoute === "comments" && urlParts.length === 6) {
        const commentId = Number(urlParts[5]);
        if (!isNaN(commentId) && commentId > 0) {
          authReq.params.commentId = commentId;
          if (method === "DELETE") {
            deleteCommentController(authReq, res);
            return;
          }
        }
      }
    }
  }

  // -------------------------------------------------------------
  // Super Admin Routes (/api/admin/...)
  // -------------------------------------------------------------
  if (pathname.startsWith("/api/admin")) {
    const authReq = req as OrgRequest;
    if (!await verifyAuth(authReq, res)) return;
    if (!requireSuperAdmin(authReq, res)) return;

    // GET /api/admin/stats
    if (pathname === "/api/admin/stats" && method === "GET") {
      await getAdminStatsController(authReq, res);
      return;
    }

    // /api/admin/orgs...
    if (pathname.startsWith("/api/admin/orgs")) {
      const parts = pathname.split("/");

      // GET /api/admin/orgs
      if (parts.length === 4 && method === "GET") {
        await listAdminOrgsController(authReq, res);
        return;
      }

      // /api/admin/orgs/:orgId
      if (parts.length === 5) {
        if (method === "GET") {
          await getAdminOrgDetailsController(authReq, res);
          return;
        }
        if (method === "DELETE") {
          await deleteAdminOrgController(authReq, res);
          return;
        }
      }

      // PATCH /api/admin/orgs/:orgId/status
      if (parts.length === 6 && parts[5] === "status" && method === "PATCH") {
        await updateAdminOrgStatusController(authReq, res);
        return;
      }
    }

    // /api/admin/users...
    if (pathname.startsWith("/api/admin/users")) {
      const parts = pathname.split("/");

      // GET /api/admin/users
      if (parts.length === 4 && method === "GET") {
        await listAdminUsersController(authReq, res);
        return;
      }

      // GET /api/admin/users/:userId
      if (parts.length === 5 && method === "GET") {
        await getAdminUserDetailsController(authReq, res);
        return;
      }

      // PATCH /api/admin/users/:userId/status
      if (parts.length === 6 && parts[5] === "status" && method === "PATCH") {
        await updateAdminUserStatusController(authReq, res);
        return;
      }

      // PATCH /api/admin/users/:userId/super-admin
      if (parts.length === 6 && parts[5] === "super-admin" && method === "PATCH") {
        await updateAdminSuperAdminController(authReq, res);
        return;
      }
    }

    // /api/admin/projects...
    if (pathname.startsWith("/api/admin/projects")) {
      const parts = pathname.split("/");
      if (parts.length === 4 && method === "GET") {
        await listAdminProjectsController(authReq, res);
        return;
      }
    }

    // /api/admin/issues...
    if (pathname.startsWith("/api/admin/issues")) {
      const parts = pathname.split("/");
      if (parts.length === 4 && method === "GET") {
        await listAdminIssuesController(authReq, res);
        return;
      }
    }
  }

  sendResponse(res, StatusCodes.NOT_FOUND, false, "Route not found!");
}
