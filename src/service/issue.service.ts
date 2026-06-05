import { pool } from "../database/db";
import type { IIssue } from "../types/issue.type";

export const createIssue = async (
  title: string,
  description: string,
  type: string,
  reporterId: number,
  appName?: string,
  approvalStatus?: string,
): Promise<IIssue> => {
  const query = `
    INSERT INTO issues (title, description, type, reporter_id, app_name, approval_status)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const values = [title, description, type, reporterId, appName || null, approvalStatus || 'approved'];
  const result = await pool.query(query, values);
  return result.rows[0] as IIssue;
};

export const getAllIssues = async (
  sortOrder?: string,
  typeFilter?: string,
  statusFilter?: string,
  userRole?: string,
  userId?: number,
): Promise<IIssue[]> => {
  let query = "SELECT * FROM issues WHERE 1=1";
  const values: any[] = [];
  let paramCount = 1;

  if (userRole === "client" && userId) {
    query += ` AND reporter_id = $${paramCount}`;
    values.push(userId);
    paramCount++;
  } else {
    query += ` AND approval_status = $${paramCount}`;
    values.push('approved');
    paramCount++;
  }

  if (typeFilter) {
    query += ` AND type = $${paramCount}`;
    values.push(typeFilter);
    paramCount++;
  }

  if (statusFilter) {
    query += ` AND status = $${paramCount}`;
    values.push(statusFilter);
    paramCount++;
  }

  if (sortOrder === "oldest") {
    query += " ORDER BY created_at ASC";
  } else {
    query += " ORDER BY created_at DESC";
  }

  const result = await pool.query(query, values);
  return result.rows;
};

export const getIssueById = async (id: number): Promise<IIssue | null> => {
  const query = "SELECT * FROM issues WHERE id = $1";
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
};

export const updateIssue = async (
  id: number,
  title?: string,
  description?: string,
  type?: string,
  status?: string,
): Promise<IIssue | null> => {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (title !== undefined) {
    updates.push(`title = $${paramCount}`);
    values.push(title);
    paramCount++;
  }

  if (description !== undefined) {
    updates.push(`description = $${paramCount}`);
    values.push(description);
    paramCount++;
  }

  if (type !== undefined) {
    updates.push(`type = $${paramCount}`);
    values.push(type);
    paramCount++;
  }

  if (status !== undefined) {
    updates.push(`status = $${paramCount}`);
    values.push(status);
    paramCount++;
  }

  if (updates.length === 0) {
    return null;
  }

  values.push(id);
  const query = `
    UPDATE issues
    SET ${updates.join(", ")}
    WHERE id = $${paramCount}
    RETURNING *
  `;

  const result = await pool.query(query, values);
  return result.rows[0] || null;
};

export const deleteIssue = async (id: number): Promise<boolean> => {
  const query = "DELETE FROM issues WHERE id = $1";
  const result = await pool.query(query, [id]);
  return (result.rowCount ?? 0) > 0;
};

export const getPendingIssues = async (): Promise<IIssue[]> => {
  const query = `
    SELECT * FROM issues 
    WHERE approval_status = 'pending' 
    ORDER BY created_at DESC
  `;
  const result = await pool.query(query);
  return result.rows;
};

export const approveIssue = async (
  id: number,
  action: "approved" | "rejected",
  maintainerId: number,
): Promise<IIssue | null> => {
  const query = `
    UPDATE issues
    SET approval_status = $1,
        approved_by = $2,
        approved_at = NOW()
    WHERE id = $3
    RETURNING *
  `;
  const values = [action, maintainerId, id];
  const result = await pool.query(query, values);
  return result.rows[0] || null;
};
