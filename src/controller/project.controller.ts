import * as projectService from "../service/project.service";
import { sendResponse } from "../utility/sendResponse";
import { parseBody } from "../utility/parseBody";

export async function createProjectController(req: any, res: any) {
  const body: any = await parseBody(req);
  const { name } = body;
  if (!name || name.trim().length === 0) {
    return sendResponse(res, 400, false, "Project name is required");
  }
  const project = await projectService.createProject(name.trim(), req.user.id, req.user.role);
  return sendResponse(res, 201, true, "Project created", project);
}

export async function getProjectsController(req: any, res: any) {
  let projects;
  if (req.user.role === "client") {
    projects = await projectService.getProjectsForClient(req.user.id);
  } else if (req.user.role === "maintainer") {
    projects = await projectService.getProjectsForMaintainer(req.user.id);
  } else {
    projects = await projectService.getProjectsForContributor(req.user.id);
  }
  return sendResponse(res, 200, true, "Projects fetched", projects);
}

export async function getPendingProjectsController(req: any, res: any) {
  if (req.user.role !== "maintainer") {
    return sendResponse(res, 403, false, "Only maintainers can view pending projects");
  }
  const projects = await projectService.getPendingProjects();
  return sendResponse(res, 200, true, "Pending projects fetched", projects);
}

export async function approveProjectController(req: any, res: any) {
  if (req.user.role !== "maintainer") {
    return sendResponse(res, 403, false, "Only maintainers can approve projects");
  }
  const projectId = Number(req.params.id);
  const body: any = await parseBody(req);
  const { action } = body;
  
  if (action !== "approved" && action !== "rejected") {
    return sendResponse(res, 400, false, "Action must be 'approved' or 'rejected'");
  }
  
  const project = await projectService.approveProject(projectId, action);
  return sendResponse(res, 200, true, `Project ${action}`, project);
}

export async function getProjectByIdController(req: any, res: any) {
  const projectId = Number(req.params.id);
  const allowed = await projectService.hasProjectAccess(projectId, req.user.id);
  if (!allowed) return sendResponse(res, 403, false, "You don't have access to this project");

  const project = await projectService.getProjectById(projectId);
  return sendResponse(res, 200, true, "Project fetched", project);
}
