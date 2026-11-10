import { pool } from "../database/db";
import { generateSlug, appendRandomSuffix } from "../utility/slug";
import type { IOrgSummary, IOrgDetail, IOrgMember, OrgRole } from "../types/org.type";
import { logActivity } from "./activity.service";

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Creates an organization and assigns the creator as 'owner' in a single transaction.
 */
export async function createOrganization(name: string, userId: number): Promise<IOrgSummary> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Generate a unique slug
    let slug = generateSlug(name);
    let attempts = 0;
    while (attempts < 10) {
      const checkSlug = await client.query("SELECT 1 FROM organizations WHERE slug = $1", [slug]);
      if (checkSlug.rows.length === 0) break;
      slug = appendRandomSuffix(generateSlug(name));
      attempts++;
    }

    // 2. Insert organization
    const orgResult = await client.query(
      `INSERT INTO organizations (name, slug, status, created_by)
       VALUES ($1, $2, 'active', $3)
       RETURNING id, name, slug, status`,
      [name, slug, userId]
    );
    const org = orgResult.rows[0];

    // 3. Insert creator as owner
    await client.query(
      `INSERT INTO organization_members (org_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [org.id, userId]
    );

    await client.query("COMMIT");

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      role: "owner",
      status: org.status,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Returns every organization the user belongs to (for sidebar switcher).
 */
export async function getOrganizationsForUser(userId: number): Promise<IOrgSummary[]> {
  const result = await pool.query(
    `SELECT
       o.id,
       o.name,
       o.slug,
       om.role,
       o.status
     FROM organizations o
     JOIN organization_members om ON om.org_id = o.id
     WHERE om.user_id = $1
     ORDER BY o.name ASC`,
    [userId]
  );

  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    role: r.role as OrgRole,
    status: r.status,
  }));
}

/**
 * Retrieves organization details along with member count and active project count.
 */
export async function getOrganizationDetails(orgId: number, myRole: OrgRole): Promise<IOrgDetail> {
  const result = await pool.query(
    `SELECT
       o.id,
       o.name,
       o.slug,
       o.status,
       o.created_at,
       (SELECT COUNT(*)::int FROM organization_members WHERE org_id = o.id) AS member_count,
       (SELECT COUNT(*)::int FROM projects WHERE org_id = o.id AND (archived_at IS NULL)) AS project_count
     FROM organizations o
     WHERE o.id = $1`,
    [orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Organization not found");
  }

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    my_role: myRole,
    member_count: row.member_count,
    project_count: row.project_count,
    created_at: row.created_at,
  };
}

/**
 * Updates organization details (e.g. name).
 */
export async function updateOrganization(orgId: number, name: string) {
  const result = await pool.query(
    `UPDATE organizations
     SET name = $1
     WHERE id = $2
     RETURNING id, name, slug, status, created_at`,
    [name, orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Organization not found");
  }

  return result.rows[0];
}

/**
 * Lists organization members with search, role filter, and pagination.
 */
export async function listOrganizationMembers(
  orgId: number,
  options: { role?: string | undefined; search?: string | undefined; page: number; limit: number }
): Promise<{ items: IOrgMember[]; page: number; limit: number; total: number }> {
  const { role, search, page, limit } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["om.org_id = $1"];
  const values: any[] = [orgId];
  let paramCount = 2;

  if (role) {
    conditions.push(`om.role = $${paramCount}`);
    values.push(role);
    paramCount++;
  }

  if (search) {
    conditions.push(`(u.name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`);
    values.push(`%${search}%`);
    paramCount++;
  }

  const whereClause = conditions.join(" AND ");

  // Total count query
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     WHERE ${whereClause}`,
    values
  );
  const total = countRes.rows[0]?.total || 0;

  // Data query
  const dataValues = [...values, limit, offset];
  const dataRes = await pool.query(
    `SELECT
       u.id AS user_id,
       u.name,
       u.email,
       om.role,
       om.created_at AS joined_at
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     WHERE ${whereClause}
     ORDER BY om.created_at ASC
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    dataValues
  );

  return {
    items: dataRes.rows.map((r) => ({
      user_id: r.user_id,
      name: r.name,
      email: r.email,
      role: r.role as OrgRole,
      joined_at: r.joined_at,
      created_at: r.joined_at,
    })),
    page,
    limit,
    total,
  };
}

/**
 * Updates a member's role (admin or member).
 * Prevents demoting the last owner.
 */
export async function updateMemberRole(
  orgId: number,
  targetUserId: number,
  newRole: "admin" | "member",
  actorId?: number,
  isSuperAdmin?: boolean
): Promise<IOrgMember> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Fetch current role of target user in this org
    const memberRes = await client.query(
      `SELECT om.role, u.name, u.email, om.created_at AS joined_at
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.org_id = $1 AND om.user_id = $2`,
      [orgId, targetUserId]
    );

    if (memberRes.rows.length === 0) {
      throw new NotFoundError("Member not found in this organization");
    }

    const currentMember = memberRes.rows[0];

    // 2. Guard: Cannot demote the last owner
    if (currentMember.role === "owner") {
      const ownerCountRes = await client.query(
        "SELECT COUNT(*)::int AS count FROM organization_members WHERE org_id = $1 AND role = 'owner'",
        [orgId]
      );
      if (ownerCountRes.rows[0].count <= 1) {
        throw new ConflictError("Cannot demote the last owner of the organization. Transfer ownership first.");
      }
    }

    // 3. Update role
    await client.query(
      `UPDATE organization_members
       SET role = $1
       WHERE org_id = $2 AND user_id = $3`,
      [newRole, orgId, targetUserId]
    );

    if (actorId) {
      await logActivity(client, {
        orgId,
        actorId,
        action: "member.role_changed",
        metadata: {
          target_user_id: targetUserId,
          from: currentMember.role,
          to: newRole,
        },
        isSuperAdmin,
      });
    }

    await client.query("COMMIT");

    return {
      user_id: targetUserId,
      name: currentMember.name,
      email: currentMember.email,
      role: newRole,
      joined_at: currentMember.joined_at,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Removes a member from an organization and cleans up their project_memberships.
 * Prevents removing the last owner.
 */
export async function removeOrganizationMember(
  orgId: number,
  targetUserId: number,
  actorId?: number,
  isSuperAdmin?: boolean
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Fetch target member's current role
    const memberRes = await client.query(
      "SELECT role FROM organization_members WHERE org_id = $1 AND user_id = $2",
      [orgId, targetUserId]
    );

    if (memberRes.rows.length === 0) {
      throw new NotFoundError("Member not found in this organization");
    }

    const currentRole = memberRes.rows[0].role;

    // 2. Guard: Cannot remove the last owner
    if (currentRole === "owner") {
      const ownerCountRes = await client.query(
        "SELECT COUNT(*)::int AS count FROM organization_members WHERE org_id = $1 AND role = 'owner'",
        [orgId]
      );
      if (ownerCountRes.rows[0].count <= 1) {
        throw new ConflictError("Cannot remove the last owner of the organization. Transfer ownership first.");
      }
    }

    // 3. Remove project_members rows for all projects belonging to this org
    await client.query(
      `DELETE FROM project_members
       WHERE user_id = $1 AND project_id IN (SELECT id FROM projects WHERE org_id = $2)`,
      [targetUserId, orgId]
    );

    // 4. Remove organization membership
    await client.query(
      "DELETE FROM organization_members WHERE org_id = $1 AND user_id = $2",
      [orgId, targetUserId]
    );

    if (actorId) {
      await logActivity(client, {
        orgId,
        actorId,
        action: "member.removed",
        metadata: {
          target_user_id: targetUserId,
          role: currentRole,
        },
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
}

/**
 * Transfers organization ownership from current owner to another member.
 * The previous owner becomes an 'admin'.
 */
export async function transferOrganizationOwnership(
  orgId: number,
  currentOwnerId: number,
  newOwnerId: number
): Promise<{ new_owner_id: number }> {
  if (currentOwnerId === newOwnerId) {
    return { new_owner_id: newOwnerId };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Verify target user is a member of the organization
    const targetMemberRes = await client.query(
      "SELECT role FROM organization_members WHERE org_id = $1 AND user_id = $2",
      [orgId, newOwnerId]
    );

    if (targetMemberRes.rows.length === 0) {
      throw new NotFoundError("Target user is not a member of this organization");
    }

    // 2. Demote current owner to admin
    await client.query(
      "UPDATE organization_members SET role = 'admin' WHERE org_id = $1 AND user_id = $2",
      [orgId, currentOwnerId]
    );

    // 3. Promote target user to owner
    await client.query(
      "UPDATE organization_members SET role = 'owner' WHERE org_id = $1 AND user_id = $2",
      [orgId, newOwnerId]
    );

    // 4. Update organization record
    await client.query(
      "UPDATE organizations SET created_by = $1 WHERE id = $2",
      [newOwnerId, orgId]
    );

    await client.query("COMMIT");

    return { new_owner_id: newOwnerId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Returns user profile along with all organizations the user belongs to (for /auth/me).
 */
export async function getUserWithOrganizations(userId: number) {
  const userRes = await pool.query(
    "SELECT id, name, email, is_super_admin FROM users WHERE id = $1",
    [userId]
  );

  if (userRes.rows.length === 0) {
    throw new NotFoundError("User not found");
  }

  const organizations = await getOrganizationsForUser(userId);

  return {
    user: userRes.rows[0],
    organizations,
  };
}

