import * as accessService from "../service/access.service";
import * as projectService from "../service/project.service";
import { sendResponse } from "../utility/sendResponse";
import { parseBody } from "../utility/parseBody";

export async function requestAccessController(req: any, res: any) {
  const projectId = Number(req.params.id);
  const access = await accessService.requestAccess(projectId, req.user.id);
  return sendResponse(res, 201, true, "Access requested", access);
}

async function assertIsMaintainerOfProject(req: any, res: any, projectId: number) {
  const ok = await projectService.isProjectMaintainer(projectId, req.user.id);
  if (!ok) sendResponse(res, 403, false, "You are not a maintainer of this project");
  return ok;
}

export async function listRequestsController(req: any, res: any) {
  const projectId = Number(req.params.id);
  if (!(await assertIsMaintainerOfProject(req, res, projectId))) return;
  const requests = await accessService.listPendingRequests(projectId);
  return sendResponse(res, 200, true, "Requests fetched", requests);
}

export async function decideRequestController(req: any, res: any) {
  const projectId = Number(req.params.id);
  if (!(await assertIsMaintainerOfProject(req, res, projectId))) return;
  const body: any = await parseBody(req);
  const { action } = body; // "approve" | "reject"
  const decided = await accessService.decideRequest(Number(req.params.memberId), action);
  return sendResponse(res, 200, true, "Request updated", decided);
}

export async function listContributorsController(req: any, res: any) {
  const projectId = Number(req.params.id);
  if (!(await assertIsMaintainerOfProject(req, res, projectId))) return;
  const contributors = await accessService.listApprovedContributors(projectId);
  return sendResponse(res, 200, true, "Contributors fetched", contributors);
}

export async function revokeContributorController(req: any, res: any) {
  const projectId = Number(req.params.id);
  if (!(await assertIsMaintainerOfProject(req, res, projectId))) return;
  const revoked = await accessService.revokeContributor(Number(req.params.memberId));
  return sendResponse(res, 200, true, "Access revoked", revoked);
}
