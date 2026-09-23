import * as projectService from "../service/project.service";
import { sendResponse } from "../utility/sendResponse";
import { parseBody } from "../utility/parseBody";

export async function createProjectController(req: any, res: any) {
  const body: any = await parseBody(req);
  const { name } = body;
  if (!name || name.trim().length === 0) {
    return sendResponse(res, 400, false, "Project name is required");
  }
  const project = await projectService.createProject(name.trim(), req.user.id);
  return sendResponse(res, 201, true, "Project created", project);
}

export async function getProjectsController(req: any, res: any) {
  const projects =
    req.user.role === "maintainer"
      ? await projectService.getProjectsForMaintainer(req.user.id)
      : await projectService.getProjectsForContributor(req.user.id);
  return sendResponse(res, 200, true, "Projects fetched", projects);
}

export async function getProjectByIdController(req: any, res: any) {
  const projectId = Number(req.params.id);
  const allowed = await projectService.hasProjectAccess(projectId, req.user.id);
  if (!allowed) return sendResponse(res, 403, false, "You don't have access to this project");

  const project = await projectService.getProjectById(projectId);
  return sendResponse(res, 200, true, "Project fetched", project);
}
