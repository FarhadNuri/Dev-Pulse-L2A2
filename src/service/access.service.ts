import { pool } from "../database/db";
import { ConflictError, NotFoundError } from "./org.service";
import * as invitationService from "./invitation.service";
import { logActivity } from "./activity.service";

/**
 * Contributor requests access to a project board.
 */
export async function requestAccess(
  projectId: number,
  userId: number,
  isSuperAdmin?: boolean
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const pRes = await client.query("SELECT org_id FROM projects WHERE id = $1", [projectId]);
    const orgId = pRes.rows[0]?.org_id;

    const result = await client.query(
      `INSERT INTO project_members (project_id, user_id, role, status, requested_at, decided_at, decided_by)
       VALUES ($1, $2, 'contributor', 'pending', NOW(), NULL, NULL)
       ON CONFLICT (project_id, user_id)
       DO UPDATE SET role = 'contributor', status = 'pending', requested_at = NOW(), decided_at = NULL, decided_by = NULL
       RETURNING project_id, status, requested_at`,
      [projectId, userId]
    );

    if (orgId) {
      await logActivity(client, {
        orgId,
        projectId,
        actorId: userId,
        action: "access.requested",
        metadata: { role: "contributor" },
        isSuperAdmin,
      });
    }

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Lists pending contributor requests for a project.
 */
export async function listPendingRequests(projectId: number) {
  const result = await pool.query(
    `SELECT
       pm.id,
       pm.project_id,
       pm.role,
       pm.status,
       pm.requested_at,
       u.id AS user_id,
       u.name,
       u.email
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1 AND pm.role = 'contributor' AND pm.status = 'pending'
     ORDER BY pm.requested_at ASC`,
    [projectId]
  );

  return result.rows.map((r) => ({
    id: r.id,
    project_id: r.project_id,
    user_id: r.user_id,
    requester_name: r.name,
    requester_email: r.email,
    user: {
      id: r.user_id,
      name: r.name,
      email: r.email,
    },
    role: r.role,
    status: r.status,
    requested_at: r.requested_at,
  }));
}

/**
 * Maintainer approves or rejects a project access request.
 */
export async function decideRequest(
  projectId: number,
  memberId: number,
  action: "approve" | "reject",
  deciderId: number,
  isSuperAdmin?: boolean
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const pRes = await client.query("SELECT org_id FROM projects WHERE id = $1", [projectId]);
    const orgId = pRes.rows[0]?.org_id;

    const status = action === "approve" ? "approved" : "rejected";
    const result = await client.query(
      `UPDATE project_members
       SET status = $1, decided_at = NOW(), decided_by = $2
       WHERE id = $3 AND project_id = $4
       RETURNING id, user_id, role, status, decided_at`,
      [status, deciderId, memberId, projectId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError("Access request not found");
    }

    const row = result.rows[0];

    if (orgId) {
      await logActivity(client, {
        orgId,
        projectId,
        actorId: deciderId,
        action: action === "approve" ? "access.approved" : "access.rejected",
        metadata: { user_id: row.user_id, role: row.role },
        isSuperAdmin,
      });
    }

    await client.query("COMMIT");
    return row;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Lists project members (contributors and clients).
 */
export async function listProjectMembers(
  projectId: number,
  filter?: { role?: string | undefined; status?: string | undefined }
) {
  const conditions = ["pm.project_id = $1"];
  const values: any[] = [projectId];
  let paramCount = 2;

  if (filter?.role) {
    conditions.push(`pm.role = $${paramCount}`);
    values.push(filter.role);
    paramCount++;
  }

  if (filter?.status) {
    conditions.push(`pm.status = $${paramCount}`);
    values.push(filter.status);
    paramCount++;
  }

  const result = await pool.query(
    `SELECT
       pm.id,
       pm.role,
       pm.status,
       pm.decided_at,
       u.id AS user_id,
       u.name,
       u.email
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY pm.decided_at DESC NULLS LAST, pm.requested_at ASC`,
    values
  );

  return result.rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    name: r.name,
    email: r.email,
    user: {
      id: r.user_id,
      name: r.name,
      email: r.email,
    },
    role: r.role,
    status: r.status,
    decided_at: r.decided_at,
  }));
}

/**
 * Maintainer directly adds an existing org member as an approved project member by userId or email.
 */
export async function addProjectMember(
  orgId: number,
  projectId: number,
  target: number | { userId?: number | undefined; email?: string | undefined },
  deciderId: number,
  role: "contributor" | "client" = "contributor",
  isSuperAdmin?: boolean | undefined
) {
  let targetUserId: number | undefined;
  let userName: string | undefined;
  let userEmail: string | undefined;

  if (typeof target === "number") {
    targetUserId = target;
    const uRes = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [target]);
    if (uRes.rows.length > 0) {
      userName = uRes.rows[0].name;
      userEmail = uRes.rows[0].email;
    }
  } else if (target.userId) {
    targetUserId = target.userId;
    const uRes = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [target.userId]);
    if (uRes.rows.length > 0) {
      userName = uRes.rows[0].name;
      userEmail = uRes.rows[0].email;
    }
  } else if (target.email) {
    userEmail = target.email.trim();
    const userRes = await pool.query(
      "SELECT id, name, email FROM users WHERE LOWER(email) = LOWER($1)",
      [userEmail]
    );

    // If user does not exist on the platform yet, invite them automatically!
    if (userRes.rows.length === 0) {
      if (role === "client") {
        const inv = await invitationService.createClientInvitation(
          orgId,
          projectId,
          deciderId,
          userEmail,
          isSuperAdmin
        );
        return {
          invited: true,
          invitation: inv,
          message: `Invitation sent to ${userEmail} as client for this project`,
        };
      } else {
        const inv = await invitationService.createOrgInvitation(
          orgId,
          deciderId,
          "owner",
          userEmail,
          "member",
          isSuperAdmin
        );
        return {
          invited: true,
          invitation: inv,
          message: `Invitation sent to ${userEmail} to join organization as contributor`,
        };
      }
    }

    targetUserId = userRes.rows[0].id;
    userName = userRes.rows[0].name;
    userEmail = userRes.rows[0].email;
  }

  if (!targetUserId) {
    throw new NotFoundError("User not specified");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Ensure user belongs to organization (auto-add as guest for client, or member for contributor)
    const orgMemberRes = await client.query(
      "SELECT role FROM organization_members WHERE org_id = $1 AND user_id = $2",
      [orgId, targetUserId]
    );

    if (orgMemberRes.rows.length === 0) {
      const orgRole = role === "client" ? "guest" : "member";
      await client.query(
        `INSERT INTO organization_members (org_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (org_id, user_id) DO NOTHING`,
        [orgId, targetUserId, orgRole]
      );
    }

    // 2. Check if already an approved member of this project
    const existingPm = await client.query(
      "SELECT status FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, targetUserId]
    );

    if (existingPm.rows.length > 0 && existingPm.rows[0].status === "approved") {
      throw new ConflictError("User is already an approved member of this project");
    }

    // 3. Upsert as approved member with role
    const result = await client.query(
      `INSERT INTO project_members (project_id, user_id, role, status, decided_at, decided_by)
       VALUES ($1, $2, $3, 'approved', NOW(), $4)
       ON CONFLICT (project_id, user_id)
       DO UPDATE SET role = $3, status = 'approved', decided_at = NOW(), decided_by = $4
       RETURNING id, project_id, user_id, role, status, decided_at`,
      [projectId, targetUserId, role, deciderId]
    );

    await logActivity(client, {
      orgId,
      projectId,
      actorId: deciderId,
      action: "access.approved",
      metadata: { user_id: targetUserId, role },
      isSuperAdmin,
    });

    await client.query("COMMIT");

    return {
      ...result.rows[0],
      user_id: targetUserId,
      name: userName,
      email: userEmail,
      user: {
        id: targetUserId,
        name: userName,
        email: userEmail,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Revokes an approved member's access.
 */
export async function revokeProjectMember(
  projectId: number,
  memberId: number,
  deciderId: number,
  isSuperAdmin?: boolean
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const pRes = await client.query("SELECT org_id FROM projects WHERE id = $1", [projectId]);
    const orgId = pRes.rows[0]?.org_id;

    const result = await client.query(
      `UPDATE project_members
       SET status = 'revoked', decided_at = NOW(), decided_by = $1
       WHERE id = $2 AND project_id = $3
       RETURNING id, user_id, role, status`,
      [deciderId, memberId, projectId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError("Project member not found");
    }

    const row = result.rows[0];

    if (orgId) {
      await logActivity(client, {
        orgId,
        projectId,
        actorId: deciderId,
        action: "access.revoked",
        metadata: { user_id: row.user_id, role: row.role },
        isSuperAdmin,
      });
    }

    await client.query("COMMIT");
    return row;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
