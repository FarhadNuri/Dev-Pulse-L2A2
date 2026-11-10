import { pool } from "../database/db";
import type { OrgRole } from "../types/org.type";
import { logActivity } from "./activity.service";

export interface IProjectResponse {
  id: number;
  org_id: number;
  name: string;
  description: string | null;
  archived: boolean;
  created_at: string;
  access_status: string;
  my_project_role: string | null;
  counts: {
    open: number;
    in_progress: number;
    resolved: number;
  };
}

/**
 * Creates a project inside an organization (maintainers only).
 */
export async function createProject(
  orgId: number,
  name: string,
  creatorId: number,
  description?: string,
  isSuperAdmin?: boolean
): Promise<IProjectResponse> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO projects (org_id, name, description, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, org_id, name, description, archived_at, created_at`,
      [orgId, name, description || null, creatorId]
    );

    const row = result.rows[0];

    await logActivity(client, {
      orgId,
      projectId: row.id,
      actorId: creatorId,
      action: "project.created",
      metadata: { name: row.name, description: row.description },
      isSuperAdmin,
    });

    await client.query("COMMIT");

    return {
      id: row.id,
      org_id: row.org_id,
      name: row.name,
      description: row.description,
      archived: !!row.archived_at,
      created_at: row.created_at,
      access_status: "full",
      my_project_role: null,
      counts: { open: 0, in_progress: 0, resolved: 0 },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Lists projects inside an organization with appropriate access_status and issue counts.
 */
export async function listProjects(
  orgId: number,
  userId: number,
  orgRole: OrgRole,
  isSuperAdmin: boolean,
  archived: boolean = false
): Promise<IProjectResponse[]> {
  const isMaintainer = orgRole === "owner" || orgRole === "admin" || isSuperAdmin;
  const isGuest = orgRole === "guest";

  let query = `
    SELECT
      p.id,
      p.org_id,
      p.name,
      p.description,
      p.archived_at,
      p.created_at,
      pm.role AS pm_role,
      pm.status AS pm_status,
      COUNT(CASE WHEN i.status = 'open' AND i.approval_status = 'approved' THEN 1 END)::int AS open_count,
      COUNT(CASE WHEN i.status = 'in_progress' AND i.approval_status = 'approved' THEN 1 END)::int AS in_progress_count,
      COUNT(CASE WHEN i.status = 'resolved' AND i.approval_status = 'approved' THEN 1 END)::int AS resolved_count
    FROM projects p
    LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
    LEFT JOIN issues i ON i.project_id = p.id
    WHERE p.org_id = $1
      AND (
        ($3 = true AND p.archived_at IS NOT NULL) OR
        ($3 = false AND p.archived_at IS NULL)
      )
  `;

  if (isGuest) {
    // Guests only see projects where they are an approved client
    query += ` AND pm.role = 'client' AND pm.status = 'approved' `;
  }

  query += `
    GROUP BY p.id, pm.role, pm.status
    ORDER BY p.created_at DESC
  `;

  const result = await pool.query(query, [orgId, userId, archived]);

  return result.rows.map((row) => {
    let accessStatus = "none";
    let myProjectRole = null;

    if (isMaintainer) {
      accessStatus = "full";
      myProjectRole = null;
    } else if (row.pm_status) {
      accessStatus = row.pm_status;
      myProjectRole = row.pm_role;
    }

    return {
      id: row.id,
      org_id: row.org_id,
      name: row.name,
      description: row.description,
      archived: !!row.archived_at,
      created_at: row.created_at,
      access_status: accessStatus,
      my_project_role: myProjectRole,
      counts: {
        open: row.open_count || 0,
        in_progress: row.in_progress_count || 0,
        resolved: row.resolved_count || 0,
      },
    };
  });
}

/**
 * Retrieves single project details.
 */
export async function getProjectDetails(
  orgId: number,
  projectId: number,
  userId: number,
  orgRole: OrgRole,
  isSuperAdmin: boolean
): Promise<IProjectResponse | null> {
  const isMaintainer = orgRole === "owner" || orgRole === "admin" || isSuperAdmin;

  const result = await pool.query(
    `SELECT
       p.id,
       p.org_id,
       p.name,
       p.description,
       p.archived_at,
       p.created_at,
       pm.role AS pm_role,
       pm.status AS pm_status,
       COUNT(CASE WHEN i.status = 'open' AND i.approval_status = 'approved' THEN 1 END)::int AS open_count,
       COUNT(CASE WHEN i.status = 'in_progress' AND i.approval_status = 'approved' THEN 1 END)::int AS in_progress_count,
       COUNT(CASE WHEN i.status = 'resolved' AND i.approval_status = 'approved' THEN 1 END)::int AS resolved_count
     FROM projects p
     LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $3
     LEFT JOIN issues i ON i.project_id = p.id
     WHERE p.id = $1 AND p.org_id = $2
     GROUP BY p.id, pm.role, pm.status`,
    [projectId, orgId, userId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  let accessStatus = "none";
  let myProjectRole = null;

  if (isMaintainer) {
    accessStatus = "full";
    myProjectRole = null;
  } else if (row.pm_status) {
    accessStatus = row.pm_status;
    myProjectRole = row.pm_role;
  }

  return {
    id: row.id,
    org_id: row.org_id,
    name: row.name,
    description: row.description,
    archived: !!row.archived_at,
    created_at: row.created_at,
    access_status: accessStatus,
    my_project_role: myProjectRole,
    counts: {
      open: row.open_count || 0,
      in_progress: row.in_progress_count || 0,
      resolved: row.resolved_count || 0,
    },
  };
}

/**
 * Updates project name or description or archive status.
 */
export async function updateProject(
  orgId: number,
  projectId: number,
  updates: { name?: string | undefined; description?: string | undefined; archived?: boolean | undefined },
  actorId?: number,
  isSuperAdmin?: boolean
): Promise<IProjectResponse | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${paramCount}`);
    values.push(updates.name);
    paramCount++;
  }

  if (updates.description !== undefined) {
    fields.push(`description = $${paramCount}`);
    values.push(updates.description);
    paramCount++;
  }

  if (updates.archived !== undefined) {
    if (updates.archived) {
      fields.push(`archived_at = NOW()`);
    } else {
      fields.push(`archived_at = NULL`);
    }
  }

  if (fields.length === 0) return null;

  values.push(projectId);
  values.push(orgId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE projects
       SET ${fields.join(", ")}
       WHERE id = $${paramCount} AND org_id = $${paramCount + 1}
       RETURNING id, org_id, name, description, archived_at, created_at`,
      values
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const row = result.rows[0];

    if (actorId) {
      let action = "project.updated";
      if (updates.archived !== undefined) {
        action = updates.archived ? "project.archived" : "project.unarchived";
      }

      await logActivity(client, {
        orgId,
        projectId: row.id,
        actorId,
        action,
        metadata: {
          name: row.name,
          ...(updates.description !== undefined ? { description: updates.description } : {}),
        },
        isSuperAdmin,
      });
    }

    await client.query("COMMIT");

    return {
      id: row.id,
      org_id: row.org_id,
      name: row.name,
      description: row.description,
      archived: !!row.archived_at,
      created_at: row.created_at,
      access_status: "full",
      my_project_role: null,
      counts: { open: 0, in_progress: 0, resolved: 0 },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
