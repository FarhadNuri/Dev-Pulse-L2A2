import { pool } from "../database/db";
import { ConflictError, NotFoundError } from "./org.service";
import type { ILabel } from "../types/label.type";

/**
 * Lists all labels belonging to the specified organization.
 */
export async function listLabels(orgId: number): Promise<ILabel[]> {
  const result = await pool.query(
    `SELECT id, org_id, name, color, created_at
     FROM labels
     WHERE org_id = $1
     ORDER BY name ASC`,
    [orgId]
  );
  return result.rows;
}

/**
 * Creates a new label in an organization.
 * Throws ConflictError (409) if a label with the same name already exists in this org.
 */
export async function createLabel(orgId: number, name: string, color: string): Promise<ILabel> {
  const existing = await pool.query(
    "SELECT id FROM labels WHERE org_id = $1 AND LOWER(name) = LOWER($2)",
    [orgId, name]
  );

  if (existing.rows.length > 0) {
    throw new ConflictError("A label with this name already exists in this organization");
  }

  const result = await pool.query(
    `INSERT INTO labels (org_id, name, color)
     VALUES ($1, $2, $3)
     RETURNING id, org_id, name, color, created_at`,
    [orgId, name, color]
  );

  return result.rows[0];
}

/**
 * Updates an existing label.
 * Throws NotFoundError (404) if label not found in this org.
 * Throws ConflictError (409) if renaming conflicts with an existing label name in this org.
 */
export async function updateLabel(
  orgId: number,
  labelId: number,
  updates: { name?: string | undefined; color?: string | undefined }
): Promise<ILabel> {
  const existing = await pool.query(
    "SELECT id, org_id, name, color, created_at FROM labels WHERE id = $1 AND org_id = $2",
    [labelId, orgId]
  );

  if (existing.rows.length === 0) {
    throw new NotFoundError("Label not found");
  }

  const current = existing.rows[0];

  if (updates.name && updates.name.toLowerCase() !== current.name.toLowerCase()) {
    const conflict = await pool.query(
      "SELECT id FROM labels WHERE org_id = $1 AND LOWER(name) = LOWER($2) AND id != $3",
      [orgId, updates.name, labelId]
    );
    if (conflict.rows.length > 0) {
      throw new ConflictError("A label with this name already exists in this organization");
    }
  }

  const newName = updates.name !== undefined ? updates.name : current.name;
  const newColor = updates.color !== undefined ? updates.color : current.color;

  const result = await pool.query(
    `UPDATE labels
     SET name = $1, color = $2
     WHERE id = $3 AND org_id = $4
     RETURNING id, org_id, name, color, created_at`,
    [newName, newColor, labelId, orgId]
  );

  return result.rows[0];
}

/**
 * Deletes a label from an organization.
 * Foreign key CASCADE automatically removes it from issue_labels.
 */
export async function deleteLabel(orgId: number, labelId: number): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM labels WHERE id = $1 AND org_id = $2 RETURNING id",
    [labelId, orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Label not found");
  }

  return true;
}

/**
 * Validates that all provided label IDs belong to the specified organization.
 */
export async function validateLabelsBelongToOrg(orgId: number, labelIds: number[]): Promise<boolean> {
  if (!labelIds || labelIds.length === 0) return true;

  const uniqueIds = Array.from(new Set(labelIds));
  const result = await pool.query(
    "SELECT id FROM labels WHERE org_id = $1 AND id = ANY($2::int[])",
    [orgId, uniqueIds]
  );

  return result.rows.length === uniqueIds.length;
}

