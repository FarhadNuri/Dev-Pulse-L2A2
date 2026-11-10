import crypto from "node:crypto";
import { pool } from "../database/db";
import { config } from "../config";
import { logActivity } from "./activity.service";
import type {
  IAttachment,
  ISignAttachmentRequest,
  IRegisterAttachmentRequest,
} from "../types/attachment.type";

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

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ATTACHMENTS_PER_ISSUE = 5;

/**
 * Validates request and generates signed parameters for direct upload to Cloudinary.
 */
export async function generateUploadSignature(
  orgId: number,
  issueId: number,
  data: ISignAttachmentRequest
) {
  // 1. Validate mime_type
  if (!ALLOWED_MIME_TYPES.has(data.mime_type)) {
    throw new ValidationError(
      "Invalid mime_type. Only image/png, image/jpeg, and image/webp are allowed."
    );
  }

  // 2. Validate size_bytes
  if (data.size_bytes <= 0 || data.size_bytes > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError(
      "Invalid size_bytes. File size must be greater than 0 and at most 5 MB (5,242,880 bytes)."
    );
  }

  // 3. Check attachment limit (max 5 per issue)
  const countRes = await pool.query(
    "SELECT COUNT(*)::int AS total FROM attachments WHERE issue_id = $1",
    [issueId]
  );
  const currentCount = countRes.rows[0]?.total || 0;
  if (currentCount >= MAX_ATTACHMENTS_PER_ISSUE) {
    throw new ValidationError(
      `Attachment limit reached. Maximum ${MAX_ATTACHMENTS_PER_ISSUE} attachments allowed per issue.`
    );
  }

  // 4. Build signed parameters
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `devpulse/org-${orgId}/issue-${issueId}`;
  const randomSuffix = crypto.randomBytes(4).toString("hex");
  const publicId = `${folder}/${timestamp}_${randomSuffix}`;

  // Cloudinary signature is SHA-1 of alphabetical sorted params + apiSecret
  const stringToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash("sha1")
    .update(stringToSign + config.cloudinary.apiSecret)
    .digest("hex");

  const uploadUrl = `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/image/upload`;

  return {
    upload_url: uploadUrl,
    params: {
      api_key: config.cloudinary.apiKey,
      timestamp,
      signature,
      folder,
      public_id: publicId,
    },
  };
}

/**
 * Saves an attachment record after Cloudinary upload succeeds.
 */
export async function saveAttachment(
  orgId: number,
  issueId: number,
  userId: number,
  data: IRegisterAttachmentRequest,
  isSuperAdmin?: boolean
): Promise<IAttachment> {
  const expectedFolder = `devpulse/org-${orgId}/issue-${issueId}`;

  // 1. Verify public_id starts with expected folder
  if (!data.public_id || !data.public_id.startsWith(expectedFolder + "/")) {
    throw new ValidationError(
      `Invalid public_id. It must start with "${expectedFolder}/"`
    );
  }

  // 2. Validate mime_type
  if (!ALLOWED_MIME_TYPES.has(data.mime_type)) {
    throw new ValidationError(
      "Invalid mime_type. Only image/png, image/jpeg, and image/webp are allowed."
    );
  }

  // 3. Validate size_bytes
  if (data.size_bytes <= 0 || data.size_bytes > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError(
      "Invalid size_bytes. File size must be greater than 0 and at most 5 MB."
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Fetch issue & project info
    const issueRes = await client.query(
      `SELECT i.id, i.project_id, p.org_id
       FROM issues i
       JOIN projects p ON p.id = i.project_id
       WHERE i.id = $1 AND p.org_id = $2`,
      [issueId, orgId]
    );

    if (issueRes.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new NotFoundError("Issue not found");
    }

    const issueInfo = issueRes.rows[0];

    // Check count limit
    const countRes = await client.query(
      "SELECT COUNT(*)::int AS total FROM attachments WHERE issue_id = $1",
      [issueId]
    );
    const currentCount = countRes.rows[0]?.total || 0;
    if (currentCount >= MAX_ATTACHMENTS_PER_ISSUE) {
      await client.query("ROLLBACK");
      throw new ValidationError(
        `Attachment limit reached. Maximum ${MAX_ATTACHMENTS_PER_ISSUE} attachments allowed per issue.`
      );
    }

    // Insert attachment
    const insertRes = await client.query(
      `INSERT INTO attachments (issue_id, uploaded_by, url, public_id, file_name, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        issueId,
        userId,
        data.url,
        data.public_id,
        data.file_name,
        data.mime_type,
        data.size_bytes,
      ]
    );

    const attachmentRow = insertRes.rows[0];

    // Log activity
    await logActivity(client, {
      orgId,
      projectId: issueInfo.project_id,
      issueId,
      actorId: userId,
      action: "attachment.added",
      metadata: {
        attachment_id: attachmentRow.id,
        file_name: attachmentRow.file_name,
      },
      isSuperAdmin,
    });

    await client.query("COMMIT");

    // Fetch uploader info
    const userRes = await pool.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [userId]
    );
    const uploader = userRes.rows[0];

    return {
      id: attachmentRow.id,
      issue_id: attachmentRow.issue_id,
      uploaded_by: attachmentRow.uploaded_by,
      url: attachmentRow.url,
      public_id: attachmentRow.public_id,
      file_name: attachmentRow.file_name,
      mime_type: attachmentRow.mime_type,
      size_bytes: attachmentRow.size_bytes,
      created_at: attachmentRow.created_at,
      uploader: uploader
        ? {
            id: uploader.id,
            name: uploader.name,
            email: uploader.email,
          }
        : undefined,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Calls Cloudinary signed destroy API to remove an image from Cloudinary.
 */
export async function destroyCloudinaryAttachment(publicId: string): Promise<boolean> {
  if (!config.cloudinary.cloudName || !config.cloudinary.apiSecret || !config.cloudinary.apiKey) {
    return false;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const stringToSign = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash("sha1")
    .update(stringToSign + config.cloudinary.apiSecret)
    .digest("hex");

  const destroyUrl = `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/image/destroy`;

  const bodyParams = new URLSearchParams({
    public_id: publicId,
    timestamp: timestamp.toString(),
    api_key: config.cloudinary.apiKey,
    signature,
  });

  try {
    const res = await fetch(destroyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: bodyParams.toString(),
    });
    return res.ok;
  } catch (err) {
    console.error("Cloudinary destroy error:", err);
    return false;
  }
}

/**
 * Deletes an attachment.
 * Maintainers can delete any attachment; uploaders can delete their own.
 */
export async function deleteAttachment(
  orgId: number,
  attachmentId: number,
  userId: number,
  isMaintainer: boolean,
  isSuperAdmin?: boolean
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const query = `
      SELECT a.*, i.project_id, p.org_id
      FROM attachments a
      JOIN issues i ON i.id = a.issue_id
      JOIN projects p ON p.id = i.project_id
      WHERE a.id = $1 AND p.org_id = $2
    `;
    const res = await client.query(query, [attachmentId, orgId]);

    if (res.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new NotFoundError("Attachment not found");
    }

    const attachment = res.rows[0];

    // Check permission: maintainer or uploader
    if (!isMaintainer && attachment.uploaded_by !== userId) {
      await client.query("ROLLBACK");
      throw new ForbiddenError("You can only delete your own attachments");
    }

    // Call Cloudinary destroy API
    await destroyCloudinaryAttachment(attachment.public_id);

    // Delete from DB
    await client.query("DELETE FROM attachments WHERE id = $1", [attachmentId]);

    // Log activity
    await logActivity(client, {
      orgId,
      projectId: attachment.project_id,
      issueId: attachment.issue_id,
      actorId: userId,
      action: "attachment.deleted",
      metadata: {
        attachment_id: attachment.id,
        file_name: attachment.file_name,
      },
      isSuperAdmin,
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

