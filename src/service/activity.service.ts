import { pool } from "../database/db";

export interface Queryable {
  query: (text: string, params?: any[]) => Promise<any>;
}

export interface IActivityLogInput {
  orgId: number;
  projectId?: number | null | undefined;
  issueId?: number | null | undefined;
  actorId: number;
  action: string;
  metadata?: Record<string, any> | undefined;
  isSuperAdmin?: boolean | undefined;
}

export interface ActivityActor {
  id: number;
  name: string;
  email: string;
}

export interface ActivityEntry {
  id: number;
  org_id: number;
  project_id: number | null;
  issue_id: number | null;
  actor_id: number;
  action: string;
  metadata: Record<string, any>;
  created_at: string;
  actor: ActivityActor;
}

export interface PaginatedActivityResponse {
  items: ActivityEntry[];
  next_cursor: number | null;
}

/**
 * Atomic activity logger that takes the same database client as the write operation.
 */
export async function logActivity(
  client: Queryable,
  data: IActivityLogInput
): Promise<any> {
  const meta: Record<string, any> = { ...(data.metadata || {}) };
  if (data.isSuperAdmin) {
    meta.super_admin = true;
  }

  const result = await client.query(
    `INSERT INTO activity_log (org_id, project_id, issue_id, actor_id, action, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, org_id, project_id, issue_id, actor_id, action, metadata, created_at`,
    [
      data.orgId,
      data.projectId ?? null,
      data.issueId ?? null,
      data.actorId,
      data.action,
      JSON.stringify(meta),
    ]
  );

  return result.rows[0];
}

/**
 * Lists project activity with cursor pagination.
 */
export async function listProjectActivity(
  orgId: number,
  projectId: number,
  options: { limit?: number | undefined; before?: number | undefined } = {}
): Promise<PaginatedActivityResponse> {
  const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 100);
  const before = options.before ? Number(options.before) : null;

  const conditions = ["a.org_id = $1", "a.project_id = $2"];
  const params: any[] = [orgId, projectId];
  let paramCount = 3;

  if (before && !isNaN(before)) {
    conditions.push(`a.id < $${paramCount}`);
    params.push(before);
    paramCount++;
  }

  params.push(limit + 1);

  const query = `
    SELECT
      a.id,
      a.org_id,
      a.project_id,
      a.issue_id,
      a.actor_id,
      a.action,
      a.metadata,
      a.created_at,
      u.id AS actor_user_id,
      u.name AS actor_name,
      u.email AS actor_email
    FROM activity_log a
    LEFT JOIN users u ON u.id = a.actor_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY a.id DESC
    LIMIT $${paramCount}
  `;

  const result = await pool.query(query, params);
  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
  const next_cursor = hasMore && rows.length > 0 ? rows[rows.length - 1].id : null;

  const items: ActivityEntry[] = rows.map((r: any) => ({
    id: r.id,
    org_id: r.org_id,
    project_id: r.project_id,
    issue_id: r.issue_id,
    actor_id: r.actor_id,
    action: r.action,
    metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : (r.metadata || {}),
    created_at: r.created_at,
    actor: {
      id: r.actor_user_id || r.actor_id,
      name: r.actor_name || "Unknown User",
      email: r.actor_email || "",
    },
  }));

  return { items, next_cursor };
}

/**
 * Lists issue activity with cursor pagination.
 */
export async function listIssueActivity(
  orgId: number,
  issueId: number,
  options: { limit?: number | undefined; before?: number | undefined } = {}
): Promise<PaginatedActivityResponse> {
  const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 100);
  const before = options.before ? Number(options.before) : null;

  const conditions = ["a.org_id = $1", "a.issue_id = $2"];
  const params: any[] = [orgId, issueId];
  let paramCount = 3;

  if (before && !isNaN(before)) {
    conditions.push(`a.id < $${paramCount}`);
    params.push(before);
    paramCount++;
  }

  params.push(limit + 1);

  const query = `
    SELECT
      a.id,
      a.org_id,
      a.project_id,
      a.issue_id,
      a.actor_id,
      a.action,
      a.metadata,
      a.created_at,
      u.id AS actor_user_id,
      u.name AS actor_name,
      u.email AS actor_email
    FROM activity_log a
    LEFT JOIN users u ON u.id = a.actor_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY a.id DESC
    LIMIT $${paramCount}
  `;

  const result = await pool.query(query, params);
  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
  const next_cursor = hasMore && rows.length > 0 ? rows[rows.length - 1].id : null;

  const items: ActivityEntry[] = rows.map((r: any) => ({
    id: r.id,
    org_id: r.org_id,
    project_id: r.project_id,
    issue_id: r.issue_id,
    actor_id: r.actor_id,
    action: r.action,
    metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : (r.metadata || {}),
    created_at: r.created_at,
    actor: {
      id: r.actor_user_id || r.actor_id,
      name: r.actor_name || "Unknown User",
      email: r.actor_email || "",
    },
  }));

  return { items, next_cursor };
}

/**
 * Lists org-wide activity (Owner only, supports super admin actions).
 */
export async function listOrgActivity(
  orgId: number,
  options: {
    limit?: number | undefined;
    before?: number | undefined;
    actor?: number | undefined;
    action?: string | undefined;
  } = {}
): Promise<PaginatedActivityResponse> {
  const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 100);
  const before = options.before ? Number(options.before) : null;
  const actor = options.actor ? Number(options.actor) : null;
  const action = options.action ? options.action.trim() : null;

  const conditions = ["a.org_id = $1"];
  const params: any[] = [orgId];
  let paramCount = 2;

  if (before && !isNaN(before)) {
    conditions.push(`a.id < $${paramCount}`);
    params.push(before);
    paramCount++;
  }

  if (actor && !isNaN(actor)) {
    conditions.push(`a.actor_id = $${paramCount}`);
    params.push(actor);
    paramCount++;
  }

  if (action) {
    conditions.push(`a.action = $${paramCount}`);
    params.push(action);
    paramCount++;
  }

  params.push(limit + 1);

  const query = `
    SELECT
      a.id,
      a.org_id,
      a.project_id,
      a.issue_id,
      a.actor_id,
      a.action,
      a.metadata,
      a.created_at,
      u.id AS actor_user_id,
      u.name AS actor_name,
      u.email AS actor_email
    FROM activity_log a
    LEFT JOIN users u ON u.id = a.actor_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY a.id DESC
    LIMIT $${paramCount}
  `;

  const result = await pool.query(query, params);
  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
  const next_cursor = hasMore && rows.length > 0 ? rows[rows.length - 1].id : null;

  const items: ActivityEntry[] = rows.map((r: any) => ({
    id: r.id,
    org_id: r.org_id,
    project_id: r.project_id,
    issue_id: r.issue_id,
    actor_id: r.actor_id,
    action: r.action,
    metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : (r.metadata || {}),
    created_at: r.created_at,
    actor: {
      id: r.actor_user_id || r.actor_id,
      name: r.actor_name || "Unknown User",
      email: r.actor_email || "",
    },
  }));

  return { items, next_cursor };
}
