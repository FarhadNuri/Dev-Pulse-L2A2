import { pool } from "../database/db";
import { logActivity } from "./activity.service";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface MentionableUser {
  id: number;
  name: string;
  email: string;
}

export interface CommentWithAuthor {
  id: number;
  issue_id: number;
  author_id?: number;
  body: string;
  created_at: string;
  updated_at: string;
  author: {
    id: number;
    name: string;
    email: string;
  };
  mentions?: {
    id: number;
    name: string;
  }[];
}

export const getMentionableUsers = async (
  orgId: number,
  projectId: number
): Promise<MentionableUser[]> => {
  const query = `
    SELECT DISTINCT u.id, u.name, u.email
    FROM users u
    WHERE u.status = 'active'
      AND (
        -- Org maintainers (owner, admin)
        u.id IN (
          SELECT om.user_id
          FROM organization_members om
          WHERE om.org_id = $1 AND om.role IN ('owner', 'admin')
        )
        OR
        -- Approved contributors of this project
        u.id IN (
          SELECT pm.user_id
          FROM project_members pm
          WHERE pm.project_id = $2 AND pm.role = 'contributor' AND pm.status = 'approved'
        )
      )
      -- Explicitly exclude guests/clients
      AND u.id NOT IN (
        SELECT om2.user_id
        FROM organization_members om2
        WHERE om2.org_id = $1 AND om2.role = 'guest'
      )
      AND u.id NOT IN (
        SELECT pm2.user_id
        FROM project_members pm2
        WHERE pm2.project_id = $2 AND pm2.role = 'client'
      )
    ORDER BY u.name ASC
  `;
  const result = await pool.query(query, [orgId, projectId]);
  return result.rows;
};

export const getCommentsByIssueId = async (
  issueId: number,
): Promise<CommentWithAuthor[]> => {
  const query = `
    SELECT 
      c.id,
      c.issue_id,
      c.body,
      c.created_at,
      c.updated_at,
      json_build_object(
        'id', u.id,
        'name', u.name,
        'email', u.email
      ) AS author,
      COALESCE(
        (
          SELECT json_agg(json_build_object('id', mu.id, 'name', mu.name))
          FROM comment_mentions cm
          JOIN users mu ON mu.id = cm.user_id
          WHERE cm.comment_id = c.id
        ),
        '[]'::json
      ) AS mentions
    FROM comments c
    JOIN users u ON u.id = c.author_id
    WHERE c.issue_id = $1
    ORDER BY c.created_at ASC
  `;
  const result = await pool.query(query, [issueId]);
  return result.rows.map((row: any) => {
    let mentions = row.mentions;
    if (typeof mentions === "string") {
      try {
        mentions = JSON.parse(mentions);
      } catch {
        mentions = [];
      }
    }
    return {
      ...row,
      mentions: Array.isArray(mentions) ? mentions : [],
    };
  });
};

export const createComment = async (
  issueId: number,
  authorId: number,
  body: string,
  mentions?: number[],
  isSuperAdmin?: boolean
): Promise<CommentWithAuthor> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const issueRes = await client.query(
      `SELECT i.id, i.project_id, p.org_id
       FROM issues i
       JOIN projects p ON p.id = i.project_id
       WHERE i.id = $1`,
      [issueId]
    );

    if (issueRes.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new Error("Issue not found");
    }

    const issueInfo = issueRes.rows[0];

    // Validate mentions if provided
    let mentionedUsers: { id: number; name: string }[] = [];
    if (mentions && mentions.length > 0) {
      const uniqueMentions = [...new Set(mentions)];
      const mentionable = await getMentionableUsers(issueInfo.org_id, issueInfo.project_id);
      const mentionableMap = new Map(mentionable.map((m) => [m.id, m.name]));

      for (const mId of uniqueMentions) {
        if (!mentionableMap.has(mId)) {
          await client.query("ROLLBACK");
          throw new ValidationError(
            `User ${mId} cannot be mentioned. Only project maintainers and approved contributors can be mentioned.`
          );
        }
      }

      mentionedUsers = uniqueMentions.map((id) => ({
        id,
        name: mentionableMap.get(id) || "Unknown",
      }));
    }

    const insertQuery = `
      INSERT INTO comments (issue_id, author_id, body)
      VALUES ($1, $2, $3)
      RETURNING id, issue_id, body, created_at, updated_at
    `;
    const result = await client.query(insertQuery, [issueId, authorId, body]);
    const newComment = result.rows[0];

    if (mentionedUsers.length > 0) {
      for (const m of mentionedUsers) {
        await client.query(
          `INSERT INTO comment_mentions (comment_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT (comment_id, user_id) DO NOTHING`,
          [newComment.id, m.id]
        );
        // NOTIFY (P13): comment mention -> notify each mentioned user (bell + email)
      }
    }

    const userRes = await client.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [authorId]
    );
    const author = userRes.rows[0] || { id: authorId, name: "Unknown", email: "" };

    await logActivity(client, {
      orgId: issueInfo.org_id,
      projectId: issueInfo.project_id,
      issueId,
      actorId: authorId,
      action: "comment.added",
      metadata: { comment_id: newComment.id },
      isSuperAdmin,
    });

    await client.query("COMMIT");

    return {
      ...newComment,
      author,
      mentions: mentionedUsers,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getCommentWithOrg = async (
  commentId: number,
  orgId: number,
): Promise<{ id: number; author_id: number; issue_id: number; org_id: number } | null> => {
  const query = `
    SELECT c.id, c.author_id, c.issue_id, p.org_id
    FROM comments c
    JOIN issues i ON i.id = c.issue_id
    JOIN projects p ON p.id = i.project_id
    WHERE c.id = $1 AND p.org_id = $2
  `;
  const result = await pool.query(query, [commentId, orgId]);
  return result.rows[0] || null;
};

export const deleteComment = async (
  id: number,
  actorId?: number,
  isSuperAdmin?: boolean
): Promise<boolean> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const cRes = await client.query(
      `SELECT c.id, c.issue_id, i.project_id, p.org_id
       FROM comments c
       JOIN issues i ON i.id = c.issue_id
       JOIN projects p ON p.id = i.project_id
       WHERE c.id = $1`,
      [id]
    );

    if (cRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return false;
    }

    const row = cRes.rows[0];

    const result = await client.query("DELETE FROM comments WHERE id = $1", [id]);

    if (actorId) {
      await logActivity(client, {
        orgId: row.org_id,
        projectId: row.project_id,
        issueId: row.issue_id,
        actorId,
        action: "comment.deleted",
        metadata: { comment_id: id },
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
};
