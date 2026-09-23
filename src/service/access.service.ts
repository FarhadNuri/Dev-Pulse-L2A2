import { pool } from "../database/db";

export async function requestAccess(projectId: number, userId: number) {
  const result = await pool.query(
    `INSERT INTO project_members (project_id, user_id, role, status, requested_at)
     VALUES ($1, $2, 'contributor', 'pending', NOW())
     ON CONFLICT (project_id, user_id)
     DO UPDATE SET status = 'pending', requested_at = NOW(), decided_at = NULL
     RETURNING *`,
    [projectId, userId]
  );
  return result.rows[0];
}

export async function listPendingRequests(projectId: number) {
  const result = await pool.query(
    `SELECT pm.id, pm.status, pm.requested_at, u.name AS requester_name
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1 AND pm.role = 'contributor' AND pm.status = 'pending'
     ORDER BY pm.requested_at ASC`,
    [projectId]
  );
  return result.rows;
}

export async function decideRequest(memberId: number, action: "approve" | "reject") {
  const status = action === "approve" ? "approved" : "rejected";
  const result = await pool.query(
    `UPDATE project_members SET status = $1, decided_at = NOW()
     WHERE id = $2 AND role = 'contributor' RETURNING *`,
    [status, memberId]
  );
  return result.rows[0];
}

export async function listApprovedContributors(projectId: number) {
  const result = await pool.query(
    `SELECT pm.id, u.name, u.id AS user_id
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1 AND pm.role = 'contributor' AND pm.status = 'approved'
     ORDER BY u.name ASC`,
    [projectId]
  );
  return result.rows;
}

export async function revokeContributor(memberId: number) {
  const result = await pool.query(
    `UPDATE project_members SET status = 'revoked', decided_at = NOW()
     WHERE id = $1 AND role = 'contributor' RETURNING *`,
    [memberId]
  );
  return result.rows[0];
}
