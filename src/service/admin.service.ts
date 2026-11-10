import { pool } from "../database/db";
import type { PoolClient } from "pg";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Records an entry in platform_audit_log.
 */
export async function logPlatformAudit(
  clientOrPool: PoolClient | typeof pool,
  entry: {
    actorId: number;
    action: string;
    targetType: string;
    targetId: number | null;
    metadata?: Record<string, any>;
  }
) {
  try {
    await clientOrPool.query(
      `INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        entry.actorId,
        entry.action,
        entry.targetType,
        entry.targetId,
        JSON.stringify(entry.metadata || {}),
      ]
    );
  } catch (err) {
    console.error("Failed to log platform audit:", err);
  }
}

/**
 * Platform stats:
 * { users, organizations, projects, issues, pending_issues, signups_last_7_days, active_orgs_last_7_days }
 */
export async function getStats() {
  const [
    usersRes,
    orgsRes,
    projectsRes,
    issuesRes,
    pendingRes,
    signupsRes,
    activeOrgsRes,
  ] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM users"),
    pool.query("SELECT COUNT(*)::int AS count FROM organizations"),
    pool.query("SELECT COUNT(*)::int AS count FROM projects WHERE archived_at IS NULL"),
    pool.query("SELECT COUNT(*)::int AS count FROM issues"),
    pool.query("SELECT COUNT(*)::int AS count FROM issues WHERE approval_status = 'pending'"),
    pool.query(
      "SELECT COUNT(*)::int AS count FROM users WHERE created_at >= NOW() - INTERVAL '7 days'"
    ),
    pool.query(
      "SELECT COUNT(DISTINCT org_id)::int AS count FROM activity_log WHERE created_at >= NOW() - INTERVAL '7 days'"
    ),
  ]);

  let activeOrgsCount = activeOrgsRes.rows[0]?.count || 0;
  if (activeOrgsCount === 0) {
    const activeFallback = await pool.query(
      "SELECT COUNT(*)::int AS count FROM organizations WHERE status = 'active'"
    );
    activeOrgsCount = activeFallback.rows[0]?.count || 0;
  }

  return {
    users: usersRes.rows[0]?.count || 0,
    organizations: orgsRes.rows[0]?.count || 0,
    projects: projectsRes.rows[0]?.count || 0,
    issues: issuesRes.rows[0]?.count || 0,
    pending_issues: pendingRes.rows[0]?.count || 0,
    signups_last_7_days: signupsRes.rows[0]?.count || 0,
    active_orgs_last_7_days: activeOrgsCount,
  };
}

/**
 * List organizations with search, status filter, and pagination.
 */
export async function listOrgs(options: {
  search?: string | undefined;
  status?: string | undefined;
  activeRecentDays?: number | undefined;
  page: number;
  limit: number;
}) {
  const { search, status, activeRecentDays, page, limit } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (search && search.trim()) {
    conditions.push(`(o.name ILIKE $${paramCount} OR o.slug ILIKE $${paramCount})`);
    values.push(`%${search.trim()}%`);
    paramCount++;
  }

  if (status && status !== "all") {
    conditions.push(`o.status = $${paramCount}`);
    values.push(status);
    paramCount++;
  }

  if (activeRecentDays) {
    conditions.push(`(
      o.id IN (SELECT DISTINCT org_id FROM activity_log WHERE created_at >= NOW() - INTERVAL '${Number(activeRecentDays)} days')
      OR o.status = 'active'
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total FROM organizations o ${whereClause}`,
    values
  );
  const total = countRes.rows[0]?.total || 0;

  const dataValues = [...values, limit, offset];
  const dataRes = await pool.query(
    `SELECT
       o.id,
       o.name,
       o.slug,
       o.status,
       o.created_at,
       json_build_object(
         'id', u.id,
         'name', u.name,
         'email', u.email
       ) AS owner,
       (SELECT COUNT(*)::int FROM organization_members om WHERE om.org_id = o.id) AS member_count,
       (SELECT COUNT(*)::int FROM projects p WHERE p.org_id = o.id) AS project_count,
       (
         SELECT COUNT(*)::int
         FROM issues i
         JOIN projects pr ON pr.id = i.project_id
         WHERE pr.org_id = o.id
       ) AS issue_count
     FROM organizations o
     LEFT JOIN users u ON u.id = o.created_by
     ${whereClause}
     ORDER BY o.created_at DESC
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    dataValues
  );

  return {
    items: dataRes.rows,
    total,
    page,
    limit,
  };
}

/**
 * Get organization detail with member list and project list.
 */
export async function getOrgDetails(orgId: number) {
  const orgRes = await pool.query(
    `SELECT
       o.id,
       o.name,
       o.slug,
       o.status,
       o.created_by,
       o.created_at,
       json_build_object(
         'id', u.id,
         'name', u.name,
         'email', u.email
       ) AS owner,
       (SELECT COUNT(*)::int FROM organization_members om WHERE om.org_id = o.id) AS member_count,
       (SELECT COUNT(*)::int FROM projects p WHERE p.org_id = o.id) AS project_count,
       (
         SELECT COUNT(*)::int
         FROM issues i
         JOIN projects pr ON pr.id = i.project_id
         WHERE pr.org_id = o.id
       ) AS issue_count
     FROM organizations o
     LEFT JOIN users u ON u.id = o.created_by
     WHERE o.id = $1`,
    [orgId]
  );

  if (orgRes.rows.length === 0) {
    throw new NotFoundError("Organization not found");
  }

  const [membersRes, projectsRes] = await Promise.all([
    pool.query(
      `SELECT
         om.id,
         om.user_id,
         u.name,
         u.email,
         om.role,
         u.status,
         om.created_at
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.org_id = $1
       ORDER BY om.created_at ASC`,
      [orgId]
    ),
    pool.query(
      `SELECT
         p.id,
         p.name,
         p.description,
         p.archived_at,
         p.created_at,
         (SELECT COUNT(*)::int FROM issues i WHERE i.project_id = p.id) AS issue_count
       FROM projects p
       WHERE p.org_id = $1
       ORDER BY p.created_at DESC`,
      [orgId]
    ),
  ]);

  return {
    org: orgRes.rows[0],
    members: membersRes.rows,
    projects: projectsRes.rows,
  };
}

/**
 * Update organization status ('active' | 'suspended').
 */
export async function updateOrgStatus(
  orgId: number,
  status: "active" | "suspended",
  actorId: number
) {
  const curRes = await pool.query(
    "SELECT id, name, slug, status FROM organizations WHERE id = $1",
    [orgId]
  );

  if (curRes.rows.length === 0) {
    throw new NotFoundError("Organization not found");
  }

  const cur = curRes.rows[0];
  const oldStatus = cur.status;

  const updateRes = await pool.query(
    "UPDATE organizations SET status = $1 WHERE id = $2 RETURNING id, name, slug, status, created_at",
    [status, orgId]
  );

  await logPlatformAudit(pool, {
    actorId,
    action: "org.status_changed",
    targetType: "organization",
    targetId: orgId,
    metadata: { from: oldStatus, to: status, name: cur.name },
  });

  return updateRes.rows[0];
}

/**
 * Hard delete organization (cascade).
 * Requires confirm_name equal to the organization name.
 */
export async function deleteOrg(
  orgId: number,
  confirmName: string,
  actorId: number
) {
  const curRes = await pool.query(
    "SELECT id, name, slug FROM organizations WHERE id = $1",
    [orgId]
  );

  if (curRes.rows.length === 0) {
    throw new NotFoundError("Organization not found");
  }

  const cur = curRes.rows[0];

  if (confirmName !== cur.name) {
    throw new ValidationError(
      `Confirmation name "${confirmName}" does not match organization name "${cur.name}"`
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Cascaded deletion of all org resources in safe dependency order
    // 1. Issues in projects belonging to this org (cascades comments, attachments, issue_labels)
    await client.query(
      `DELETE FROM issues WHERE project_id IN (SELECT id FROM projects WHERE org_id = $1)`,
      [orgId]
    );

    // 2. Project members
    await client.query(
      `DELETE FROM project_members WHERE project_id IN (SELECT id FROM projects WHERE org_id = $1)`,
      [orgId]
    );

    // 3. Invitations for this org and its projects
    await client.query(
      `DELETE FROM invitations WHERE org_id = $1 OR project_id IN (SELECT id FROM projects WHERE org_id = $1)`,
      [orgId]
    );

    // 4. Projects belonging to this org
    await client.query("DELETE FROM projects WHERE org_id = $1", [orgId]);

    // 5. Activity log rows for this org
    await client.query("DELETE FROM activity_log WHERE org_id = $1", [orgId]);

    // 6. Labels for this org
    await client.query("DELETE FROM labels WHERE org_id = $1", [orgId]);

    // 7. Organization members
    await client.query("DELETE FROM organization_members WHERE org_id = $1", [orgId]);

    // 8. Delete the organization
    await client.query("DELETE FROM organizations WHERE id = $1", [orgId]);

    await logPlatformAudit(client, {
      actorId,
      action: "org.deleted",
      targetType: "organization",
      targetId: orgId,
      metadata: { name: cur.name, slug: cur.slug },
    });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * List users with search, status filter, and pagination.
 */
export async function listUsers(options: {
  search?: string | undefined;
  status?: string | undefined;
  recentDays?: number | undefined;
  page: number;
  limit: number;
}) {
  const { search, status, recentDays, page, limit } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (search && search.trim()) {
    conditions.push(`(u.name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`);
    values.push(`%${search.trim()}%`);
    paramCount++;
  }

  if (status && status !== "all") {
    conditions.push(`u.status = $${paramCount}`);
    values.push(status);
    paramCount++;
  }

  if (recentDays) {
    conditions.push(`u.created_at >= NOW() - INTERVAL '${Number(recentDays)} days'`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total FROM users u ${whereClause}`,
    values
  );
  const total = countRes.rows[0]?.total || 0;

  const dataValues = [...values, limit, offset];
  const dataRes = await pool.query(
    `SELECT
       u.id,
       u.name,
       u.email,
       u.status,
       u.is_super_admin,
       u.created_at,
       (SELECT COUNT(*)::int FROM organization_members om WHERE om.user_id = u.id) AS org_count
     FROM users u
     ${whereClause}
     ORDER BY u.created_at DESC
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    dataValues
  );

  return {
    items: dataRes.rows,
    total,
    page,
    limit,
  };
}

/**
 * Get user detail with their organizations and roles.
 */
export async function getUserDetails(userId: number) {
  const userRes = await pool.query(
    "SELECT id, name, email, status, is_super_admin, created_at, updated_at FROM users WHERE id = $1",
    [userId]
  );

  if (userRes.rows.length === 0) {
    throw new NotFoundError("User not found");
  }

  const orgsRes = await pool.query(
    `SELECT
       o.id,
       o.name,
       o.slug,
       om.role,
       o.status,
       om.created_at AS joined_at
     FROM organization_members om
     JOIN organizations o ON o.id = om.org_id
     WHERE om.user_id = $1
     ORDER BY om.created_at DESC`,
    [userId]
  );

  return {
    user: userRes.rows[0],
    organizations: orgsRes.rows,
  };
}

/**
 * Update user status ('active' | 'disabled').
 * Protects the last super admin from being disabled.
 */
export async function updateUserStatus(
  userId: number,
  status: "active" | "disabled",
  actorId: number
) {
  const curRes = await pool.query(
    "SELECT id, name, email, status, is_super_admin FROM users WHERE id = $1",
    [userId]
  );

  if (curRes.rows.length === 0) {
    throw new NotFoundError("User not found");
  }

  const cur = curRes.rows[0];

  // Protect last active super admin
  if (cur.is_super_admin && status === "disabled") {
    const adminCountRes = await pool.query(
      "SELECT COUNT(*)::int AS count FROM users WHERE is_super_admin = true AND status = 'active' AND id != $1",
      [userId]
    );
    const otherAdmins = adminCountRes.rows[0]?.count || 0;
    if (otherAdmins === 0) {
      throw new ConflictError("Cannot disable the last active super admin");
    }
  }

  const updateRes = await pool.query(
    "UPDATE users SET status = $1 WHERE id = $2 RETURNING id, name, email, status, is_super_admin, created_at",
    [status, userId]
  );

  await logPlatformAudit(pool, {
    actorId,
    action: "user.status_changed",
    targetType: "user",
    targetId: userId,
    metadata: { from: cur.status, to: status, email: cur.email },
  });

  return updateRes.rows[0];
}

/**
 * Promote or demote super admin.
 * Protects the last super admin from being demoted.
 */
export async function updateSuperAdmin(
  userId: number,
  value: boolean,
  actorId: number
) {
  const curRes = await pool.query(
    "SELECT id, name, email, status, is_super_admin FROM users WHERE id = $1",
    [userId]
  );

  if (curRes.rows.length === 0) {
    throw new NotFoundError("User not found");
  }

  const cur = curRes.rows[0];

  // Protect last super admin
  if (!value && cur.is_super_admin) {
    const adminCountRes = await pool.query(
      "SELECT COUNT(*)::int AS count FROM users WHERE is_super_admin = true AND id != $1",
      [userId]
    );
    const otherAdmins = adminCountRes.rows[0]?.count || 0;
    if (otherAdmins === 0) {
      throw new ConflictError("Cannot remove the last super admin");
    }
  }

  const updateRes = await pool.query(
    "UPDATE users SET is_super_admin = $1 WHERE id = $2 RETURNING id, name, email, status, is_super_admin, created_at",
    [value, userId]
  );

  await logPlatformAudit(pool, {
    actorId,
    action: "user.super_admin_changed",
    targetType: "user",
    targetId: userId,
    metadata: { value, email: cur.email },
  });

  return updateRes.rows[0];
}

/**
 * List all projects across the platform for Super Admin.
 */
export async function listAllProjects(options: {
  search?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}) {
  const { search, page = 1, limit = 50 } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["p.archived_at IS NULL"];
  const values: any[] = [];
  let paramCount = 1;

  if (search && search.trim()) {
    conditions.push(`(p.name ILIKE $${paramCount} OR o.name ILIKE $${paramCount})`);
    values.push(`%${search.trim()}%`);
    paramCount++;
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total FROM projects p JOIN organizations o ON o.id = p.org_id ${whereClause}`,
    values
  );
  const total = countRes.rows[0]?.total || 0;

  const dataValues = [...values, limit, offset];
  const dataRes = await pool.query(
    `SELECT
       p.id,
       p.name,
       p.description,
       p.created_at,
       o.id AS org_id,
       o.name AS org_name,
       o.slug AS org_slug,
       COUNT(CASE WHEN i.status = 'open' AND i.approval_status = 'approved' THEN 1 END)::int AS open_count,
       COUNT(CASE WHEN i.status = 'in_progress' AND i.approval_status = 'approved' THEN 1 END)::int AS in_progress_count,
       COUNT(CASE WHEN i.status = 'resolved' AND i.approval_status = 'approved' THEN 1 END)::int AS resolved_count,
       (SELECT COUNT(*)::int FROM project_members WHERE project_id = p.id) AS member_count
     FROM projects p
     JOIN organizations o ON o.id = p.org_id
     LEFT JOIN issues i ON i.project_id = p.id
     ${whereClause}
     GROUP BY p.id, o.id
     ORDER BY p.created_at DESC
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    dataValues
  );

  return {
    items: dataRes.rows,
    total,
    page,
    limit,
  };
}

/**
 * List all issues across the platform for Super Admin.
 */
export async function listAllIssues(options: {
  search?: string | undefined;
  approvalStatus?: string | undefined;
  status?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}) {
  const { search, approvalStatus, status, page = 1, limit = 50 } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (search && search.trim()) {
    conditions.push(`(i.title ILIKE $${paramCount} OR i.description ILIKE $${paramCount} OR p.name ILIKE $${paramCount})`);
    values.push(`%${search.trim()}%`);
    paramCount++;
  }

  if (approvalStatus && approvalStatus !== "all") {
    conditions.push(`i.approval_status = $${paramCount}`);
    values.push(approvalStatus);
    paramCount++;
  }

  if (status && status !== "all") {
    conditions.push(`i.status = $${paramCount}`);
    values.push(status);
    paramCount++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     JOIN organizations o ON o.id = p.org_id
     ${whereClause}`,
    values
  );
  const total = countRes.rows[0]?.total || 0;

  const dataValues = [...values, limit, offset];
  const dataRes = await pool.query(
    `SELECT
       i.id,
       i.title,
       i.description,
       i.type,
       i.status,
       i.approval_status,
       i.rejection_reason,
       i.created_at,
       p.id AS project_id,
       p.name AS project_name,
       o.id AS org_id,
       o.name AS org_name,
       json_build_object(
         'id', u.id,
         'name', u.name,
         'email', u.email
       ) AS reporter
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     JOIN organizations o ON o.id = p.org_id
     LEFT JOIN users u ON u.id = i.reporter_id
     ${whereClause}
     ORDER BY i.created_at DESC
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    dataValues
  );

  return {
    items: dataRes.rows,
    total,
    page,
    limit,
  };
}

