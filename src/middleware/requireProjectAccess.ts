import * as projectService from "../service/project.service";
import { sendResponse } from "../utility/sendResponse";
import { StatusCodes } from "http-status-codes";
import type { ServerResponse } from "http";

export async function requireProjectAccess(req: any, res: ServerResponse, projectId: number): Promise<boolean> {
  const allowed = await projectService.hasProjectAccess(projectId, req.user.id, req.user.role);
  if (!allowed) {
    sendResponse(res, StatusCodes.FORBIDDEN, false, "You don't have access to this project");
    return false;
  }
  return true;
}
