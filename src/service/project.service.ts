import { pool } from "../database/db";

export async function createProject(name: string, creatorId: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const projectResult = await client.query(
      "INSERT INTO projects (name, created_by) VALUES ($1, $2) RETURNING *",
      [name, creatorId]
    );
    const project = projectResult.rows[0];

    // Creator becomes the project's first maintainer, approved immediately.
    await client.query(
      `INSERT INTO project_members (project_id, user_id, role, status, decided_at)
       VALUES ($1, $2, 'maintainer', 'approved', NOW())`,
      [project.id, creatorId]
    );

    await client.query("COMMIT");
    return project;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Maintainer sees only projects where they are a member (any role, approved).
export async function getProjectsForMaintainer(userId: number) {
  const result = await pool.query(
    `SELECT p.* FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = $1 AND pm.role = 'maintainer' AND pm.status = 'approved'
     ORDER BY p.created_at DESC`,
    [userId]
  );
  return result.rows;
}

// Contributor sees every project, plus their own membership status (or null).
export async function getProjectsForContributor(userId: number) {
  const result = await pool.query(
    `SELECT p.*, pm.status AS access_status
     FROM projects p
     LEFT JOIN project_members pm
       ON pm.project_id = p.id AND pm.user_id = $1 AND pm.role = 'contributor'
     ORDER BY p.created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function getProjectById(projectId: number) {
  const result = await pool.query("SELECT * FROM projects WHERE id = $1", [projectId]);
  return result.rows[0];
}

// Any approved member (maintainer or contributor) can view the board.
export async function hasProjectAccess(projectId: number, userId: number) {
  const result = await pool.query(
    "SELECT status FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, userId]
  );
  return result.rows[0]?.status === "approved";
}

// Only approved maintainers can manage the project (approve/reject/revoke/add maintainer).
export async function isProjectMaintainer(projectId: number, userId: number) {
  const result = await pool.query(
    `SELECT 1 FROM project_members
     WHERE project_id = $1 AND user_id = $2 AND role = 'maintainer' AND status = 'approved'`,
    [projectId, userId]
  );
  return result.rows.length > 0;
}
