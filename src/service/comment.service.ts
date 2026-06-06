import { pool } from "../database/db";
import type { IComment } from "../types/comment.type";

export const createComment = async (
  issueId: number,
  authorId: number,
  body: string,
): Promise<IComment> => {
  const query = `
    INSERT INTO comments (issue_id, author_id, body)
    VALUES ($1, $2, $3)
    RETURNING *
  `;
  const result = await pool.query(query, [issueId, authorId, body]);
  return result.rows[0] as IComment;
};

export const getCommentsByIssueId = async (
  issueId: number,
): Promise<IComment[]> => {
  const query = `
    SELECT * FROM comments
    WHERE issue_id = $1
    ORDER BY created_at ASC
  `;
  const result = await pool.query(query, [issueId]);
  return result.rows;
};

export const getCommentById = async (id: number): Promise<IComment | null> => {
  const query = "SELECT * FROM comments WHERE id = $1";
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
};

export const deleteComment = async (id: number): Promise<boolean> => {
  const query = "DELETE FROM comments WHERE id = $1";
  const result = await pool.query(query, [id]);
  return (result.rowCount ?? 0) > 0;
};
