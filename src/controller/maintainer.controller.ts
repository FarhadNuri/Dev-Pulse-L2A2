import * as maintainerService from "../service/maintainer.service";
import * as projectService from "../service/project.service";
import { findUserById } from "../service/user.service";
import { sendResponse } from "../utility/sendResponse";
import { parseBody } from "../utility/parseBody";

export async function listMaintainersController(req: any, res: any) {
  const maintainers = await maintainerService.listMaintainers(Number(req.params.id));
  return sendResponse(res, 200, true, "Maintainers fetched", maintainers);
}

export async function addMaintainerController(req: any, res: any) {
  const projectId = Number(req.params.id);
  const isMaintainerHere = await projectService.isProjectMaintainer(projectId, req.user.id);
  if (!isMaintainerHere) return sendResponse(res, 403, false, "You are not a maintainer of this project");

  const body: any = await parseBody(req);
  const { userId } = body;
  const targetUser = await findUserById(Number(userId));
  if (!targetUser || targetUser.role !== "maintainer") {
    return sendResponse(res, 400, false, "Target user must have a maintainer account");
  }

  const added = await maintainerService.addMaintainer(projectId, Number(userId));
  return sendResponse(res, 201, true, "Maintainer added", added);
}
