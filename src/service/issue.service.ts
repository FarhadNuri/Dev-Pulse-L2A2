import { pool } from "../database/db";
import type { IIssue } from "../types/issue.type";

export const createIssue = async (
  title: string,
  description: string,
  type: string,
  reporterId: number,
): Promise<IIssue> => {
  const query = `
    INSERT INTO issues (title, description, type, reporter_id)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const values = [title, description, type, reporterId];
  const result = await pool.query(query, values);
  return result.rows[0] as IIssue;
};

export const getAllIssues = async (
  sortOrder?: string,
  typeFilter?: string,
  statusFilter?: string,
): Promise<IIssue[]> => {
  let query = "SELECT * FROM issues WHERE 1=1";
  const values: any[] = [];
  let paramCount = 1;

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
