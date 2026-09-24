import { pool } from "../database/db";

export async function listMaintainers(projectId: number) {
  const result = await pool.query(
    `SELECT pm.id, u.id AS user_id, u.name
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1 AND pm.role = 'maintainer' AND pm.status = 'approved'
     ORDER BY pm.decided_at ASC`,
    [projectId]
  );
  return result.rows;
}

// Target user must already have a maintainer-role account (checked in the controller).
export async function addMaintainer(projectId: number, userId: number) {
  const result = await pool.query(
    `INSERT INTO project_members (project_id, user_id, role, status, decided_at)
     VALUES ($1, $2, 'maintainer', 'approved', NOW())
     ON CONFLICT (project_id, user_id)
     DO UPDATE SET role = 'maintainer', status = 'approved', decided_at = NOW()
     RETURNING *`,
    [projectId, userId]
  );
  return result.rows[0];
}
