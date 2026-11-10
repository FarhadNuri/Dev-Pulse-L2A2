import type { ServerResponse } from "http";
import { StatusCodes } from "http-status-codes";
import { parseBody } from "../utility/parseBody";
import { sendResponse } from "../utility/sendResponse";
import * as projectService from "../service/project.service";
import type { OrgRequest } from "../types/org.type";
import { validateSchema, createProjectSchema, updateProjectSchema } from "../validation";

/**
 * GET /api/orgs/:orgId/projects
 */
export async function listProjectsController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const archived = url.searchParams.get("archived") === "true";

    const projects = await projectService.listProjects(
      orgId,
      req.user!.id,
      req.orgRole!,
      !!req.actingAsSuperAdmin,
      archived
    );

    return sendResponse(res, StatusCodes.OK, true, "Projects retrieved successfully", projects);
  } catch (error) {
    console.error("listProjects error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to list projects");
  }
}

/**
 * POST /api/orgs/:orgId/projects
 */
export async function createProjectController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const rawBody = await parseBody(req);
    const val = validateSchema(createProjectSchema, rawBody);
    if (!val.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, val.error);
    }

    const project = await projectService.createProject(
      orgId,
      val.data.name,
      req.user!.id,
      val.data.description,
      !!req.actingAsSuperAdmin
    );

    return sendResponse(res, StatusCodes.CREATED, true, "Project created successfully", project);
  } catch (error) {
    console.error("createProject error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to create project");
  }
}

/**
 * GET /api/orgs/:orgId/projects/:projectId
 */
export async function getProjectController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const projectId = Number(req.params?.projectId);

    const project = await projectService.getProjectDetails(
      orgId,
      projectId,
      req.user!.id,
      req.orgRole!,
      !!req.actingAsSuperAdmin
    );

    if (!project) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, "Project not found");
    }

    return sendResponse(res, StatusCodes.OK, true, "Project retrieved successfully", project);
  } catch (error) {
    console.error("getProject error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to retrieve project");
  }
}

/**
 * PATCH /api/orgs/:orgId/projects/:projectId
 */
export async function updateProjectController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const projectId = Number(req.params?.projectId);
    const rawBody = await parseBody(req);

    const val = validateSchema(updateProjectSchema, rawBody);
    if (!val.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, val.error);
    }

    const updated = await projectService.updateProject(
      orgId,
      projectId,
      {
        name: val.data.name,
        description: val.data.description,
      },
      req.user!.id,
      !!req.actingAsSuperAdmin
    );

    if (!updated) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, "Project not found");
    }

    return sendResponse(res, StatusCodes.OK, true, "Project updated successfully", updated);
  } catch (error) {
    console.error("updateProject error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to update project");
  }
}

/**
 * PATCH /api/orgs/:orgId/projects/:projectId/archive
 */
export async function archiveProjectController(req: OrgRequest, res: ServerResponse) {
  try {
    const orgId = Number(req.params?.orgId);
    const projectId = Number(req.params?.projectId);
    const rawBody = await parseBody(req);

    if (typeof rawBody.archived !== "boolean") {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, "archived field must be a boolean");
    }

    const updated = await projectService.updateProject(
      orgId,
      projectId,
      { archived: rawBody.archived },
      req.user!.id,
      !!req.actingAsSuperAdmin
    );

    if (!updated) {
      return sendResponse(res, StatusCodes.NOT_FOUND, false, "Project not found");
    }

    return sendResponse(res, StatusCodes.OK, true, "Project archive status updated successfully", updated);
  } catch (error) {
    console.error("archiveProject error:", error);
    return sendResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, false, "Failed to update project archive status");
  }
}
