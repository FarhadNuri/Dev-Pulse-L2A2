import { pool } from "../database/db";

export async function createProject(name: string, creatorId: number, userRole: string) {
  const client = await pool.connect();
  try {
    const approvalStatus = userRole === 'client' ? 'pending' : 'approved';
    await client.query("BEGIN");
    const projectResult = await client.query(
      "INSERT INTO projects (name, created_by, approval_status) VALUES ($1, $2, $3) RETURNING *",
      [name, creatorId, approvalStatus]
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
     WHERE pm.user_id = $1 AND pm.role = 'maintainer' AND pm.status = 'approved' AND p.approval_status = 'approved'
     ORDER BY p.created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function getPendingProjects() {
  const result = await pool.query(
    `SELECT p.* FROM projects p WHERE p.approval_status = 'pending' ORDER BY p.created_at DESC`
  );
  return result.rows;
}

export async function approveProject(projectId: number, action: 'approved' | 'rejected') {
  const result = await pool.query(
    `UPDATE projects SET approval_status = $1 WHERE id = $2 RETURNING *`,
    [action, projectId]
  );
  return result.rows[0];
}

export async function getProjectsForClient(userId: number) {
  const result = await pool.query(
    `SELECT p.* FROM projects p
     WHERE p.created_by = $1
     ORDER BY p.created_at DESC`,
    [userId]
  );
  return result.rows;
}

// Contributor sees every approved project, plus their own membership status (or null).
export async function getProjectsForContributor(userId: number) {
  const result = await pool.query(
    `SELECT p.*, pm.status AS access_status
     FROM projects p
     LEFT JOIN project_members pm
       ON pm.project_id = p.id AND pm.user_id = $1 AND pm.role = 'contributor'
     WHERE p.approval_status = 'approved'
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
