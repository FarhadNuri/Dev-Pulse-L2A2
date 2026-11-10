import { pool } from "../database/db";
import { NotFoundError } from "./org.service";
import { validateLabelsBelongToOrg } from "./label.service";
import type { IIssueFormatted } from "../types/issue.type";
import { logActivity } from "./activity.service";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Validates that the assignee is a maintainer (org owner/admin or super admin)
 * or an approved contributor of the specified project.
 */
export async function validateProjectAssignee(
  orgId: number,
  projectId: number,
  assigneeId: number
): Promise<boolean> {
  const userRes = await pool.query(
    "SELECT id, is_super_admin FROM users WHERE id = $1 AND status = 'active'",
    [assigneeId]
  );
  if (userRes.rows.length === 0) return false;
  if (userRes.rows[0].is_super_admin) return true;

  // Check if user is org owner or admin (maintainer of all org projects)
  const orgMemberRes = await pool.query(
    "SELECT role FROM organization_members WHERE org_id = $1 AND user_id = $2",
    [orgId, assigneeId]
  );
  if (orgMemberRes.rows.length > 0) {
    const role = orgMemberRes.rows[0].role;
    if (role === "owner" || role === "admin") {
      return true;
    }
  }

  // Check if user is an approved contributor on the project
  const projectMemberRes = await pool.query(
    "SELECT role, status FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, assigneeId]
  );
  if (projectMemberRes.rows.length > 0) {
    const pm = projectMemberRes.rows[0];
    if (pm.role === "contributor" && pm.status === "approved") {
      return true;
    }
  }

  return false;
}

/**
 * Helper to map a raw database row with JSON aggregated labels and counts into IIssueFormatted.
 */
function formatIssueRow(row: any): IIssueFormatted {
  let labels = row.labels;
  if (typeof labels === "string") {
    try {
      labels = JSON.parse(labels);
    } catch {
      labels = [];
    }
  }
  if (!Array.isArray(labels)) {
    labels = [];
  }

  let attachments = row.attachments;
  if (typeof attachments === "string") {
    try {
      attachments = JSON.parse(attachments);
    } catch {
      attachments = [];
    }
  }
  if (!Array.isArray(attachments)) {
    attachments = [];
  }

  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    description: row.description,
    type: row.type,
    status: row.status,
    approval_status: row.approval_status,
    rejection_reason: row.rejection_reason ?? null,
    app_name: row.app_name ?? null,
    reporter: {
      id: row.reporter_user_id,
      name: row.reporter_name,
      email: row.reporter_email,
    },
    assignee: row.assignee_user_id
      ? {
          id: row.assignee_user_id,
          name: row.assignee_name,
          email: row.assignee_email,
        }
      : null,
    labels: labels.map((l: any) => ({
      id: l.id,
      name: l.name,
      color: l.color,
    })),
    attachments: attachments.map((att: any) => ({
      id: att.id,
      issue_id: att.issue_id,
      uploaded_by: att.uploaded_by,
      url: att.url,
      public_id: att.public_id,
      file_name: att.file_name,
      mime_type: att.mime_type,
      size_bytes: att.size_bytes,
      created_at: att.created_at,
      uploader: att.uploader,
    })),
    comment_count: Number(row.comment_count) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Creates an issue in a project.
 * Maintainers and contributors -> approval_status = 'approved'
 * Clients -> approval_status = 'pending'
 */
export async function createIssue(
  orgId: number,
  projectId: number,
  title: string,
  description: string,
  type: string,
  reporterId: number,
  approvalStatus: "approved" | "pending",
  appName?: string,
  assigneeId?: number | null,
  labelIds?: number[],
  isSuperAdmin?: boolean
): Promise<IIssueFormatted> {
  // If client, assignee and labels are ignored
  let effectiveAssigneeId = assigneeId ?? null;
  let effectiveLabelIds = labelIds ?? [];

  if (approvalStatus === "pending") {
    effectiveAssigneeId = null;
    effectiveLabelIds = [];
  } else {
    // Validate assignee
    if (effectiveAssigneeId !== null) {
      const isValidAssignee = await validateProjectAssignee(orgId, projectId, effectiveAssigneeId);
      if (!isValidAssignee) {
        throw new ValidationError("Assignee must be a maintainer or approved contributor of this project");
      }
    }

    // Validate labels
    if (effectiveLabelIds.length > 0) {
      const areLabelsValid = await validateLabelsBelongToOrg(orgId, effectiveLabelIds);
      if (!areLabelsValid) {
        throw new ValidationError("All labels must belong to this organization");
      }
    }
  }

  const client = await pool.connect();
  let newIssueId: number;

  try {
    await client.query("BEGIN");

    const query = `
      INSERT INTO issues (project_id, title, description, type, reporter_id, assignee_id, approval_status, app_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;
    const values = [
      projectId,
      title,
      description,
      type,
      reporterId,
      effectiveAssigneeId,
      approvalStatus,
      appName || null,
    ];
    const result = await client.query(query, values);
    newIssueId = result.rows[0].id;

    // Insert labels if provided
    if (effectiveLabelIds.length > 0) {
      const uniqueLabels = Array.from(new Set(effectiveLabelIds));
      for (const labelId of uniqueLabels) {
        await client.query(
          "INSERT INTO issue_labels (issue_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [newIssueId, labelId]
        );
      }
    }

    await logActivity(client, {
      orgId,
      projectId,
      issueId: newIssueId,
      actorId: reporterId,
      action: "issue.created",
      metadata: {
        title,
        type,
        status: "open",
        approval_status: approvalStatus,
      },
      isSuperAdmin,
    });

    if (effectiveAssigneeId) {
      await logActivity(client, {
        orgId,
        projectId,
        issueId: newIssueId,
        actorId: reporterId,
        action: "issue.assigned",
        metadata: { assignee_id: effectiveAssigneeId },
        isSuperAdmin,
      });
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  if (approvalStatus === "pending") {
    // NOTIFY (P13): issue.created pending -> notify maintainers
  }
  if (effectiveAssigneeId) {
    // NOTIFY (P13): issue assigned -> notify assignee (bell + email)
  }

  const formatted = await getSingleIssue(orgId, newIssueId);
  if (!formatted) {
    throw new Error("Failed to retrieve created issue");
  }
  return formatted;
}

/**
 * Lists issues for a project board.
 * - Clients only see issues they reported.
 * - Maintainers and contributors see all approved issues.
 * Supports: search, status, type, assignee, label, sort, pagination.
 */
export async function listIssues(
  orgId: number,
  projectId: number,
  callerId: number,
  callerProjectRole: string,
  options: {
    search?: string | undefined;
    status?: string | undefined;
    type?: string | undefined;
    assignee?: string | undefined;
    label?: string | string[] | undefined;
    sort?: string | undefined;
    page: number;
    limit: number;
  }
) {
  const { search, status, type, assignee, label, sort, page, limit } = options;
  const offset = (page - 1) * limit;

  const conditions = ["i.project_id = $1", "p.org_id = $2"];
  const values: any[] = [projectId, orgId];
  let paramCount = 3;

  if (callerProjectRole === "client") {
    conditions.push(`i.reporter_id = $${paramCount}`);
    values.push(callerId);
    paramCount++;
  } else {
    conditions.push("i.approval_status = 'approved'");
  }

  if (status) {
    conditions.push(`i.status = $${paramCount}`);
    values.push(status);
    paramCount++;
  }

  if (type) {
    conditions.push(`i.type = $${paramCount}`);
    values.push(type);
    paramCount++;
  }

  if (search) {
    // Escape % and _ for ILIKE wildcard safety
    const escaped = search.replace(/[%_\\]/g, "\\$&");
    conditions.push(`(i.title ILIKE $${paramCount} OR i.description ILIKE $${paramCount})`);
    values.push(`%${escaped}%`);
    paramCount++;
  }

  if (assignee) {
    if (assignee === "me") {
      conditions.push(`i.assignee_id = $${paramCount}`);
      values.push(callerId);
      paramCount++;
    } else if (assignee === "none") {
      conditions.push("i.assignee_id IS NULL");
    } else {
      const parsedAssigneeId = Number(assignee);
      if (!isNaN(parsedAssigneeId) && parsedAssigneeId > 0) {
        conditions.push(`i.assignee_id = $${paramCount}`);
        values.push(parsedAssigneeId);
        paramCount++;
      }
    }
  }

  // Parse label param(s)
  const rawLabels = Array.isArray(label) ? label : (label ? [label] : []);
  const parsedLabelIds: number[] = [];
  for (const item of rawLabels) {
    for (const part of String(item).split(",")) {
      const num = Number(part.trim());
      if (!isNaN(num) && num > 0) {
        parsedLabelIds.push(num);
      }
    }
  }

  if (parsedLabelIds.length > 0) {
    const uniqueLabelIds = Array.from(new Set(parsedLabelIds));
    conditions.push(`i.id IN (
      SELECT issue_id
      FROM issue_labels
      WHERE label_id = ANY($${paramCount}::int[])
      GROUP BY issue_id
      HAVING COUNT(DISTINCT label_id) = $${paramCount + 1}
    )`);
    values.push(uniqueLabelIds);
    values.push(uniqueLabelIds.length);
    paramCount += 2;
  }

  const whereClause = conditions.join(" AND ");

  // Count total
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     WHERE ${whereClause}`,
    values
  );
  const total = countRes.rows[0]?.total || 0;

  // Order
  const orderDir = sort === "oldest" ? "ASC" : "DESC";

  // Data query
  const dataValues = [...values, limit, offset];
  const dataRes = await pool.query(
    `SELECT
       i.*,
       p.org_id,
       u.id AS reporter_user_id,
       u.name AS reporter_name,
       u.email AS reporter_email,
       a.id AS assignee_user_id,
       a.name AS assignee_name,
       a.email AS assignee_email,
       COALESCE(
         (SELECT COUNT(*)::int FROM comments c WHERE c.issue_id = i.id),
         0
       ) AS comment_count,
       COALESCE(
         (
           SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color))
           FROM issue_labels il
           JOIN labels l ON l.id = il.label_id
           WHERE il.issue_id = i.id
         ),
         '[]'::json
       ) AS labels,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', att.id,
                'issue_id', att.issue_id,
                'uploaded_by', att.uploaded_by,
                'url', att.url,
                'public_id', att.public_id,
                'file_name', att.file_name,
                'mime_type', att.mime_type,
                'size_bytes', att.size_bytes,
                'created_at', att.created_at,
                'uploader', json_build_object(
                  'id', uu.id,
                  'name', uu.name,
                  'email', uu.email
                )
              ) ORDER BY att.created_at ASC
            )
            FROM attachments att
            JOIN users uu ON uu.id = att.uploaded_by
            WHERE att.issue_id = i.id
          ),
          '[]'::json
        ) AS attachments
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     JOIN users u ON u.id = i.reporter_id
     LEFT JOIN users a ON a.id = i.assignee_id
     WHERE ${whereClause}
     ORDER BY i.created_at ${orderDir}
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    dataValues
  );

  return {
    items: dataRes.rows.map(formatIssueRow),
    page,
    limit,
    total,
  };
}

/**
 * Returns pending approval queue for maintainers.
 */
export async function listPendingIssues(
  orgId: number,
  options: { projectId?: number | undefined; page: number; limit: number }
) {
  const { projectId, page, limit } = options;
  const offset = (page - 1) * limit;

  const conditions = ["p.org_id = $1", "i.approval_status = 'pending'"];
  const values: any[] = [orgId];
  let paramCount = 2;

  if (projectId) {
    conditions.push(`i.project_id = $${paramCount}`);
    values.push(projectId);
    paramCount++;
  }

  const whereClause = conditions.join(" AND ");

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     WHERE ${whereClause}`,
    values
  );
  const total = countRes.rows[0]?.total || 0;

  const dataValues = [...values, limit, offset];
  const dataRes = await pool.query(
    `SELECT
       i.*,
       p.org_id,
       u.id AS reporter_user_id,
       u.name AS reporter_name,
       u.email AS reporter_email,
       a.id AS assignee_user_id,
       a.name AS assignee_name,
       a.email AS assignee_email,
       COALESCE(
         (SELECT COUNT(*)::int FROM comments c WHERE c.issue_id = i.id),
         0
       ) AS comment_count,
       COALESCE(
         (
           SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color))
           FROM issue_labels il
           JOIN labels l ON l.id = il.label_id
           WHERE il.issue_id = i.id
         ),
         '[]'::json
       ) AS labels,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', att.id,
                'issue_id', att.issue_id,
                'uploaded_by', att.uploaded_by,
                'url', att.url,
                'public_id', att.public_id,
                'file_name', att.file_name,
                'mime_type', att.mime_type,
                'size_bytes', att.size_bytes,
                'created_at', att.created_at,
                'uploader', json_build_object(
                  'id', uu.id,
                  'name', uu.name,
                  'email', uu.email
                )
              ) ORDER BY att.created_at ASC
            )
            FROM attachments att
            JOIN users uu ON uu.id = att.uploaded_by
            WHERE att.issue_id = i.id
          ),
          '[]'::json
        ) AS attachments
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     JOIN users u ON u.id = i.reporter_id
     LEFT JOIN users a ON a.id = i.assignee_id
     WHERE ${whereClause}
     ORDER BY i.created_at DESC
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    dataValues
  );

  return {
    items: dataRes.rows.map(formatIssueRow),
    page,
    limit,
    total,
  };
}

/**
 * Retrieves a single issue ensuring it belongs to the given org.
 */
export async function getSingleIssue(orgId: number, issueId: number): Promise<IIssueFormatted | null> {
  const result = await pool.query(
    `SELECT
       i.*,
       p.org_id,
       u.id AS reporter_user_id,
       u.name AS reporter_name,
       u.email AS reporter_email,
       a.id AS assignee_user_id,
       a.name AS assignee_name,
       a.email AS assignee_email,
       COALESCE(
         (SELECT COUNT(*)::int FROM comments c WHERE c.issue_id = i.id),
         0
       ) AS comment_count,
       COALESCE(
         (
           SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color))
           FROM issue_labels il
           JOIN labels l ON l.id = il.label_id
           WHERE il.issue_id = i.id
         ),
         '[]'::json
       ) AS labels,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', att.id,
                'issue_id', att.issue_id,
                'uploaded_by', att.uploaded_by,
                'url', att.url,
                'public_id', att.public_id,
                'file_name', att.file_name,
                'mime_type', att.mime_type,
                'size_bytes', att.size_bytes,
                'created_at', att.created_at,
                'uploader', json_build_object(
                  'id', uu.id,
                  'name', uu.name,
                  'email', uu.email
                )
              ) ORDER BY att.created_at ASC
            )
            FROM attachments att
            JOIN users uu ON uu.id = att.uploaded_by
            WHERE att.issue_id = i.id
          ),
          '[]'::json
        ) AS attachments
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     JOIN users u ON u.id = i.reporter_id
     LEFT JOIN users a ON a.id = i.assignee_id
     WHERE i.id = $1 AND p.org_id = $2`,
    [issueId, orgId]
  );

  if (result.rows.length === 0) return null;
  return formatIssueRow(result.rows[0]);
}

/**
 * Updates issue fields including assignee and labels.
 */
export async function updateIssue(
  orgId: number,
  issueId: number,
  updates: {
    title?: string | undefined;
    description?: string | undefined;
    type?: string | undefined;
    status?: string | undefined;
    assigneeId?: number | null | undefined;
    labelIds?: number[] | undefined;
  },
  actorId?: number,
  isSuperAdmin?: boolean
): Promise<IIssueFormatted | null> {
  const current = await getSingleIssue(orgId, issueId);
  if (!current) return null;

  // Validate assignee if provided
  if (updates.assigneeId !== undefined && updates.assigneeId !== null) {
    const isValidAssignee = await validateProjectAssignee(orgId, current.project_id, updates.assigneeId);
    if (!isValidAssignee) {
      throw new ValidationError("Assignee must be a maintainer or approved contributor of this project");
    }
  }

  // Validate labels if provided
  if (updates.labelIds !== undefined && updates.labelIds.length > 0) {
    const areLabelsValid = await validateLabelsBelongToOrg(orgId, updates.labelIds);
    if (!areLabelsValid) {
      throw new ValidationError("All labels must belong to this organization");
    }
  }

  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (updates.title !== undefined) {
    fields.push(`title = $${paramCount}`);
    values.push(updates.title);
    paramCount++;
  }

  if (updates.description !== undefined) {
    fields.push(`description = $${paramCount}`);
    values.push(updates.description);
    paramCount++;
  }

  if (updates.type !== undefined) {
    fields.push(`type = $${paramCount}`);
    values.push(updates.type);
    paramCount++;
  }

  if (updates.status !== undefined) {
    fields.push(`status = $${paramCount}`);
    values.push(updates.status);
    paramCount++;
  }

  if (updates.assigneeId !== undefined) {
    fields.push(`assignee_id = $${paramCount}`);
    values.push(updates.assigneeId);
    paramCount++;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (fields.length > 0) {
      values.push(issueId);
      values.push(orgId);

      await client.query(
        `UPDATE issues
         SET ${fields.join(", ")}
         WHERE id = $${paramCount} AND project_id IN (SELECT id FROM projects WHERE org_id = $${paramCount + 1})`,
        values
      );
    }

    // Update labels if provided
    if (updates.labelIds !== undefined) {
      await client.query("DELETE FROM issue_labels WHERE issue_id = $1", [issueId]);
      const uniqueLabels = Array.from(new Set(updates.labelIds));
      for (const labelId of uniqueLabels) {
        await client.query(
          "INSERT INTO issue_labels (issue_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [issueId, labelId]
        );
      }
    }

    if (actorId) {
      if (updates.status !== undefined && updates.status !== current.status) {
        await logActivity(client, {
          orgId,
          projectId: current.project_id,
          issueId,
          actorId,
          action: "issue.status_changed",
          metadata: { from: current.status, to: updates.status },
          isSuperAdmin,
        });
      }

      if (updates.assigneeId !== undefined && updates.assigneeId !== (current.assignee?.id ?? null)) {
        await logActivity(client, {
          orgId,
          projectId: current.project_id,
          issueId,
          actorId,
          action: "issue.assigned",
          metadata: { assignee_id: updates.assigneeId },
          isSuperAdmin,
        });
      }

      const hasContentUpdate =
        (updates.title !== undefined && updates.title !== current.title) ||
        (updates.description !== undefined && updates.description !== current.description) ||
        (updates.type !== undefined && updates.type !== current.type);

      if (hasContentUpdate) {
        await logActivity(client, {
          orgId,
          projectId: current.project_id,
          issueId,
          actorId,
          action: "issue.updated",
          metadata: {
            title: updates.title ?? current.title,
            type: updates.type ?? current.type,
          },
          isSuperAdmin,
        });
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  if (
    updates.assigneeId !== undefined &&
    updates.assigneeId !== null &&
    updates.assigneeId !== current.assignee?.id
  ) {
    // NOTIFY (P13): issue assigned -> notify assignee (bell + email)
  }

  if (updates.status === "resolved" && current.status !== "resolved") {
    // NOTIFY (P13): issue moved to resolved -> notify reporter
  }

  return await getSingleIssue(orgId, issueId);
}

/**
 * Deletes an issue.
 */
export async function deleteIssue(
  orgId: number,
  issueId: number,
  actorId?: number,
  isSuperAdmin?: boolean
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const issueRes = await client.query(
      `SELECT i.id, i.project_id, i.title
       FROM issues i
       JOIN projects p ON p.id = i.project_id
       WHERE i.id = $1 AND p.org_id = $2`,
      [issueId, orgId]
    );

    if (issueRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return false;
    }

    const cur = issueRes.rows[0];

    const result = await client.query(
      `DELETE FROM issues
       WHERE id = $1 AND project_id IN (SELECT id FROM projects WHERE org_id = $2)`,
      [issueId, orgId]
    );

    if (actorId) {
      await logActivity(client, {
        orgId,
        projectId: cur.project_id,
        issueId,
        actorId,
        action: "issue.deleted",
        metadata: { title: cur.title },
        isSuperAdmin,
      });
    }

    await client.query("COMMIT");
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Maintainer approves or rejects a pending client issue.
 * Rejection requires a reason (1 to 500 chars).
 */
export async function decideIssueApproval(
  orgId: number,
  issueId: number,
  action: "approved" | "rejected",
  deciderId: number,
  reason?: string,
  isSuperAdmin?: boolean
): Promise<IIssueFormatted | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const issueRes = await client.query(
      `SELECT i.id, i.project_id, i.title
       FROM issues i
       JOIN projects p ON p.id = i.project_id
       WHERE i.id = $1 AND p.org_id = $2`,
      [issueId, orgId]
    );

    if (issueRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const cur = issueRes.rows[0];

    if (action === "approved") {
      await client.query(
        `UPDATE issues
         SET approval_status = 'approved',
             approved_by = $1,
             approved_at = NOW(),
             rejection_reason = NULL
         WHERE id = $2 AND project_id IN (SELECT id FROM projects WHERE org_id = $3)`,
        [deciderId, issueId, orgId]
      );

      await logActivity(client, {
        orgId,
        projectId: cur.project_id,
        issueId,
        actorId: deciderId,
        action: "issue.approved",
        metadata: { action: "approved" },
        isSuperAdmin,
      });

      // NOTIFY (P13): issue approved -> notify reporter (bell + email)
    } else {
      await client.query(
        `UPDATE issues
         SET approval_status = 'rejected',
             approved_by = $1,
             approved_at = NOW(),
             rejection_reason = $4
         WHERE id = $2 AND project_id IN (SELECT id FROM projects WHERE org_id = $3)`,
        [deciderId, issueId, orgId, reason]
      );

      await logActivity(client, {
        orgId,
        projectId: cur.project_id,
        issueId,
        actorId: deciderId,
        action: "issue.rejected",
        metadata: { reason: reason || "" },
        isSuperAdmin,
      });

      // NOTIFY (P13): issue rejected -> notify reporter (bell + email, includes reason on reject)
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return await getSingleIssue(orgId, issueId);
}

/**
 * Client resubmits a rejected issue back to 'pending'.
 */
export async function resubmitIssue(
  orgId: number,
  issueId: number,
  reporterId: number,
  isSuperAdmin?: boolean
): Promise<IIssueFormatted | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE issues
       SET approval_status = 'pending',
           rejection_reason = NULL
       WHERE id = $1
         AND reporter_id = $2
         AND approval_status = 'rejected'
         AND project_id IN (SELECT id FROM projects WHERE org_id = $3)
       RETURNING id, project_id, title`,
      [issueId, reporterId, orgId]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const cur = result.rows[0];

    await logActivity(client, {
      orgId,
      projectId: cur.project_id,
      issueId,
      actorId: reporterId,
      action: "issue.resubmitted",
      metadata: {},
      isSuperAdmin,
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // NOTIFY (P13): issue resubmitted -> notify maintainers

  return await getSingleIssue(orgId, issueId);
}

/**
 * Lists all issues reported by caller across all projects in the org (My Requests page).
 */
export async function getMyRequests(
  orgId: number,
  userId: number,
  options: {
    status?: string | undefined;
    projectId?: number | undefined;
    page: number;
    limit: number;
  }
) {
  const { status, projectId, page, limit } = options;
  const offset = (page - 1) * limit;

  const conditions = ["p.org_id = $1", "i.reporter_id = $2"];
  const values: any[] = [orgId, userId];
  let paramCount = 3;

  if (projectId) {
    conditions.push(`i.project_id = $${paramCount}`);
    values.push(projectId);
    paramCount++;
  }

  if (status) {
    if (["pending", "approved", "rejected"].includes(status)) {
      conditions.push(`i.approval_status = $${paramCount}`);
    } else {
      conditions.push(`i.status = $${paramCount}`);
    }
    values.push(status);
    paramCount++;
  }

  const whereClause = conditions.join(" AND ");

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     WHERE ${whereClause}`,
    values
  );
  const total = countRes.rows[0]?.total || 0;

  const dataValues = [...values, limit, offset];
  const dataRes = await pool.query(
    `SELECT
       i.*,
       p.org_id,
       u.id AS reporter_user_id,
       u.name AS reporter_name,
       u.email AS reporter_email,
       a.id AS assignee_user_id,
       a.name AS assignee_name,
       a.email AS assignee_email,
       COALESCE(
         (SELECT COUNT(*)::int FROM comments c WHERE c.issue_id = i.id),
         0
       ) AS comment_count,
       COALESCE(
         (
           SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color))
           FROM issue_labels il
           JOIN labels l ON l.id = il.label_id
           WHERE il.issue_id = i.id
         ),
         '[]'::json
       ) AS labels,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', att.id,
                'issue_id', att.issue_id,
                'uploaded_by', att.uploaded_by,
                'url', att.url,
                'public_id', att.public_id,
                'file_name', att.file_name,
                'mime_type', att.mime_type,
                'size_bytes', att.size_bytes,
                'created_at', att.created_at,
                'uploader', json_build_object(
                  'id', uu.id,
                  'name', uu.name,
                  'email', uu.email
                )
              ) ORDER BY att.created_at ASC
            )
            FROM attachments att
            JOIN users uu ON uu.id = att.uploaded_by
            WHERE att.issue_id = i.id
          ),
          '[]'::json
        ) AS attachments
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     JOIN users u ON u.id = i.reporter_id
     LEFT JOIN users a ON a.id = i.assignee_id
     WHERE ${whereClause}
     ORDER BY i.created_at DESC
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    dataValues
  );

  return {
    items: dataRes.rows.map(formatIssueRow),
    page,
    limit,
    total,
  };
}
