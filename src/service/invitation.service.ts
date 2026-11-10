import { pool } from "../database/db";
import { generateInviteToken, hashToken } from "../utility/token";
import { sendInviteEmail } from "./email.service";
import type { IOrgSummary } from "../types/org.type";
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

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpiredError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface IInvitationRecord {
  id: number;
  org_id: number;
  project_id: number | null;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  invited_by: number;
  created_at: string;
}

export interface IPublicInvitation {
  email: string;
  role: string;
  org: {
    id: number;
    name: string;
  };
  project: {
    id: number;
    name: string;
  } | null;
  invited_by_name: string;
  user_exists: boolean;
}

export interface IAcceptInvitationResult {
  org: IOrgSummary;
  project_id: number | null;
}

/**
 * Creates an organization-level invitation (member or admin).
 * - Admins may only invite 'member'; only the owner (or super admin) can invite 'admin'.
 * - 409 if user with this email is already an organization member.
 * - Reuses & refreshes any existing pending invitation for same org + email.
 */
export async function createOrgInvitation(
  orgId: number,
  inviterUserId: number,
  inviterOrgRole: string,
  email: string,
  role: "admin" | "member",
  actingAsSuperAdmin = false
): Promise<{ id: number; email: string; role: string; status: string; expires_at: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Role permission guard: only owner (or super admin) can invite 'admin'
  if (role === "admin" && inviterOrgRole !== "owner" && !actingAsSuperAdmin) {
    throw new ForbiddenError("Only organization owners can invite admins");
  }

  // 2. Check if already a member of this org
  const existingMember = await pool.query(
    `SELECT om.id
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.org_id = $1 AND LOWER(u.email) = $2`,
    [orgId, normalizedEmail]
  );
  if (existingMember.rows.length > 0) {
    throw new ConflictError("User is already a member of this organization");
  }

  // 3. Fetch org name and inviter name for email
  const orgRes = await pool.query("SELECT name FROM organizations WHERE id = $1", [orgId]);
  if (orgRes.rows.length === 0) {
    throw new NotFoundError("Organization not found");
  }
  const orgName = orgRes.rows[0].name;

  const inviterRes = await pool.query("SELECT name FROM users WHERE id = $1", [inviterUserId]);
  const inviterName = inviterRes.rows[0]?.name || "An administrator";

  // 4. Generate new token & SHA-256 hash
  const { token, hash } = generateInviteToken();

  // 5. Check if there is an existing pending invite for same email + org (with project_id IS NULL)
  const pendingInvite = await pool.query(
    `SELECT id FROM invitations
     WHERE org_id = $1 AND LOWER(email) = $2 AND project_id IS NULL AND status = 'pending'`,
    [orgId, normalizedEmail]
  );

  let resultRow: any;
  if (pendingInvite.rows.length > 0) {
    // Reuse & refresh existing pending invite
    const updateRes = await pool.query(
      `UPDATE invitations
       SET token_hash = $1, role = $2, invited_by = $3, expires_at = NOW() + INTERVAL '7 days', status = 'pending'
       WHERE id = $4
       RETURNING id, email, role, status, expires_at`,
      [hash, role, inviterUserId, pendingInvite.rows[0].id]
    );
    resultRow = updateRes.rows[0];
  } else {
    // Insert new invite
    const insertRes = await pool.query(
      `INSERT INTO invitations (org_id, project_id, email, role, token_hash, invited_by, status, expires_at)
       VALUES ($1, NULL, $2, $3, $4, $5, 'pending', NOW() + INTERVAL '7 days')
       RETURNING id, email, role, status, expires_at`,
      [orgId, normalizedEmail, role, hash, inviterUserId]
    );
    resultRow = insertRes.rows[0];
  }

  await logActivity(pool, {
    orgId,
    actorId: inviterUserId,
    action: "member.invited",
    metadata: { email: normalizedEmail, role },
    isSuperAdmin: actingAsSuperAdmin,
  });

  // 6. Send invitation email (awaited, never throws)
  await sendInviteEmail({
    to: normalizedEmail,
    inviterName,
    orgName,
    role,
    token,
  });

  return {
    id: resultRow.id,
    email: resultRow.email,
    role: resultRow.role,
    status: resultRow.status,
    expires_at: resultRow.expires_at,
  };
}

/**
 * Creates a client invitation for a specific project.
 * - Client invites grant org role 'guest' and project role 'client'.
 * - 409 if user with this email is already an org owner/admin/member or already approved on this project.
 * - Reuses & refreshes any existing pending client invite for same org + project + email.
 */
export async function createClientInvitation(
  orgId: number,
  projectId: number,
  inviterUserId: number,
  email: string,
  actingAsSuperAdmin = false
): Promise<{ id: number; email: string; role: string; project_id: number; status: string; expires_at: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Verify project belongs to org
  const projectRes = await pool.query(
    "SELECT id, name FROM projects WHERE id = $1 AND org_id = $2",
    [projectId, orgId]
  );
  if (projectRes.rows.length === 0) {
    throw new NotFoundError("Project not found in this organization");
  }
  const projectName = projectRes.rows[0].name;

  // 2. Fetch org name & inviter name
  const orgRes = await pool.query("SELECT name FROM organizations WHERE id = $1", [orgId]);
  const orgName = orgRes.rows[0]?.name || "Organization";

  const inviterRes = await pool.query("SELECT name FROM users WHERE id = $1", [inviterUserId]);
  const inviterName = inviterRes.rows[0]?.name || "A project maintainer";

  // 3. Check if user is already a member/admin/owner of org, or already approved client on project
  const existingUserRes = await pool.query(
    `SELECT u.id, om.role AS org_role, pm.status AS project_status
     FROM users u
     LEFT JOIN organization_members om ON om.user_id = u.id AND om.org_id = $1
     LEFT JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = $2
     WHERE LOWER(u.email) = $3`,
    [orgId, projectId, normalizedEmail]
  );

  if (existingUserRes.rows.length > 0) {
    const userRow = existingUserRes.rows[0];
    if (userRow.org_role && userRow.org_role !== "guest") {
      throw new ConflictError("User is already a member of this organization");
    }
    if (userRow.project_status === "approved") {
      throw new ConflictError("User is already a client of this project");
    }
  }

  // 4. Generate new token & SHA-256 hash
  const { token, hash } = generateInviteToken();

  // 5. Check if existing pending invite exists for same email + org + project
  const pendingInvite = await pool.query(
    `SELECT id FROM invitations
     WHERE org_id = $1 AND project_id = $2 AND LOWER(email) = $3 AND status = 'pending'`,
    [orgId, projectId, normalizedEmail]
  );

  let resultRow: any;
  if (pendingInvite.rows.length > 0) {
    // Reuse & refresh existing pending client invite
    const updateRes = await pool.query(
      `UPDATE invitations
       SET token_hash = $1, role = 'guest', invited_by = $2, expires_at = NOW() + INTERVAL '7 days', status = 'pending'
       WHERE id = $3
       RETURNING id, email, role, project_id, status, expires_at`,
      [hash, inviterUserId, pendingInvite.rows[0].id]
    );
    resultRow = updateRes.rows[0];
  } else {
    // Insert new client invite
    const insertRes = await pool.query(
      `INSERT INTO invitations (org_id, project_id, email, role, token_hash, invited_by, status, expires_at)
       VALUES ($1, $2, $3, 'guest', $4, $5, 'pending', NOW() + INTERVAL '7 days')
       RETURNING id, email, role, project_id, status, expires_at`,
      [orgId, projectId, normalizedEmail, hash, inviterUserId]
    );
    resultRow = insertRes.rows[0];
  }

  await logActivity(pool, {
    orgId,
    projectId,
    actorId: inviterUserId,
    action: "member.invited",
    metadata: { email: normalizedEmail, role: "client", project_id: projectId },
    isSuperAdmin: actingAsSuperAdmin,
  });

  // 6. Send invitation email (awaited, never throws)
  await sendInviteEmail({
    to: normalizedEmail,
    inviterName,
    orgName,
    role: "guest",
    projectName,
    token,
  });

  return {
    id: resultRow.id,
    email: resultRow.email,
    role: resultRow.role,
    project_id: resultRow.project_id,
    status: resultRow.status,
    expires_at: resultRow.expires_at,
  };
}

/**
 * Lists invitations for an organization.
 */
export async function listInvitations(
  orgId: number,
  statusFilter?: string
): Promise<IInvitationRecord[]> {
  const conditions = ["org_id = $1"];
  const values: any[] = [orgId];

  if (statusFilter) {
    conditions.push("status = $2");
    values.push(statusFilter);
  }

  const query = `
    SELECT id, email, role, project_id, status, expires_at, invited_by, created_at
    FROM invitations
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at DESC
  `;

  const result = await pool.query(query, values);
  return result.rows;
}

/**
 * Revokes an invitation (marks status = 'revoked').
 */
export async function revokeInvitation(orgId: number, invitationId: number): Promise<void> {
  const check = await pool.query(
    "SELECT id, status FROM invitations WHERE id = $1 AND org_id = $2",
    [invitationId, orgId]
  );
  if (check.rows.length === 0) {
    throw new NotFoundError("Invitation not found");
  }

  await pool.query(
    "UPDATE invitations SET status = 'revoked' WHERE id = $1 AND org_id = $2",
    [invitationId, orgId]
  );
}

/**
 * Resends an invitation with a fresh token and resets expiration to 7 days from now.
 */
export async function resendInvitation(
  orgId: number,
  invitationId: number
): Promise<{ expires_at: string }> {
  const check = await pool.query(
    `SELECT i.*, o.name AS org_name, p.name AS project_name, u.name AS inviter_name
     FROM invitations i
     JOIN organizations o ON o.id = i.org_id
     LEFT JOIN projects p ON p.id = i.project_id
     JOIN users u ON u.id = i.invited_by
     WHERE i.id = $1 AND i.org_id = $2`,
    [invitationId, orgId]
  );
  if (check.rows.length === 0) {
    throw new NotFoundError("Invitation not found");
  }

  const invite = check.rows[0];
  if (invite.status === "accepted") {
    throw new ConflictError("Invitation has already been accepted");
  }

  const { token, hash } = generateInviteToken();

  const updateRes = await pool.query(
    `UPDATE invitations
     SET token_hash = $1, status = 'pending', expires_at = NOW() + INTERVAL '7 days'
     WHERE id = $2 AND org_id = $3
     RETURNING expires_at`,
    [hash, invitationId, orgId]
  );

  // Re-send email with new token
  await sendInviteEmail({
    to: invite.email,
    inviterName: invite.inviter_name || "An administrator",
    orgName: invite.org_name,
    role: invite.role,
    projectName: invite.project_name,
    token,
  });

  return { expires_at: updateRes.rows[0].expires_at };
}

/**
 * Retrieves public invitation metadata using the raw token.
 * Returns user_exists so frontend can determine whether to direct user to signup or login.
 * Throws ExpiredError (410) if not found, expired, revoked, or already accepted.
 */
export async function getInvitationByToken(rawToken: string): Promise<IPublicInvitation> {
  const hash = hashToken(rawToken);

  const result = await pool.query(
    `SELECT i.*, o.name AS org_name, p.name AS project_name, u.name AS inviter_name
     FROM invitations i
     JOIN organizations o ON o.id = i.org_id
     LEFT JOIN projects p ON p.id = i.project_id
     JOIN users u ON u.id = i.invited_by
     WHERE i.token_hash = $1`,
    [hash]
  );

  if (result.rows.length === 0) {
    throw new ExpiredError("Invitation not found or no longer available");
  }

  const invite = result.rows[0];
  const isExpired = new Date(invite.expires_at).getTime() <= Date.now();

  if (invite.status !== "pending" || isExpired) {
    if (isExpired && invite.status === "pending") {
      await pool.query("UPDATE invitations SET status = 'expired' WHERE id = $1", [invite.id]);
    }
    throw new ExpiredError("Invitation has expired or been revoked");
  }

  // Check if a registered user with this email already exists
  const userCheck = await pool.query(
    "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
    [invite.email]
  );
  const userExists = userCheck.rows.length > 0;

  return {
    email: invite.email,
    role: invite.role,
    org: {
      id: invite.org_id,
      name: invite.org_name,
    },
    project: invite.project_id
      ? {
          id: invite.project_id,
          name: invite.project_name,
        }
      : null,
    invited_by_name: invite.inviter_name,
    user_exists: userExists,
  };
}

/**
 * Accepts an invitation for an already authenticated user.
 * - Enforces that logged-in user email equals invited email (403 otherwise).
 * - Idempotent: returns 200 with org info if already accepted by this user.
 * - Executes in a transaction:
 *   - Client invite -> org role 'guest' + project_members 'client' approved (decided_by = inviter).
 *   - Org invite -> org role = invite.role ('admin' | 'member').
 *   - Marks invite status = 'accepted'.
 */
export async function acceptInvitation(
  rawToken: string,
  user: { id: number; email: string }
): Promise<IAcceptInvitationResult> {
  const hash = hashToken(rawToken);

  const result = await pool.query(
    `SELECT i.*, o.name AS org_name, o.slug AS org_slug, o.status AS org_status
     FROM invitations i
     JOIN organizations o ON o.id = i.org_id
     WHERE i.token_hash = $1`,
    [hash]
  );

  if (result.rows.length === 0) {
    throw new ExpiredError("Invitation not found or no longer available");
  }

  const invite = result.rows[0];

  // Email match check
  if (user.email.toLowerCase().trim() !== invite.email.toLowerCase().trim()) {
    throw new ForbiddenError("Logged-in user email does not match invitation email");
  }

  // Idempotency: if already accepted, return existing org data
  if (invite.status === "accepted") {
    const memberRole = invite.project_id ? "guest" : invite.role;
    return {
      org: {
        id: invite.org_id,
        name: invite.org_name,
        slug: invite.org_slug,
        role: memberRole,
        status: invite.org_status,
      },
      project_id: invite.project_id || null,
    };
  }

  // Expired / revoked check
  const isExpired = new Date(invite.expires_at).getTime() <= Date.now();
  if (invite.status === "revoked" || isExpired) {
    if (isExpired && invite.status === "pending") {
      await pool.query("UPDATE invitations SET status = 'expired' WHERE id = $1", [invite.id]);
    }
    throw new ExpiredError("Invitation has expired or been revoked");
  }

  // Execute acceptance inside a transaction
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (invite.project_id) {
      // 1. Client invite: org role is 'guest'
      await client.query(
        `INSERT INTO organization_members (org_id, user_id, role)
         VALUES ($1, $2, 'guest')
         ON CONFLICT (org_id, user_id) DO NOTHING`,
        [invite.org_id, user.id]
      );

      // 2. Client project membership: role 'client', status 'approved', decided_by = inviter
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role, status, decided_by, decided_at)
         VALUES ($1, $2, 'client', 'approved', $3, NOW())
         ON CONFLICT (project_id, user_id)
         DO UPDATE SET role = 'client', status = 'approved', decided_by = $3, decided_at = NOW()`,
        [invite.project_id, user.id, invite.invited_by]
      );
    } else {
      // Org invite: org role is invite.role ('admin' or 'member')
      await client.query(
        `INSERT INTO organization_members (org_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (org_id, user_id)
         DO UPDATE SET role = $3`,
        [invite.org_id, user.id, invite.role]
      );
    }

    // Mark invitation accepted
    await client.query(
      "UPDATE invitations SET status = 'accepted' WHERE id = $1",
      [invite.id]
    );

    const effectiveRole = invite.project_id ? "guest" : invite.role;

    await logActivity(client, {
      orgId: invite.org_id,
      projectId: invite.project_id || null,
      actorId: user.id,
      action: "member.joined",
      metadata: { email: invite.email, role: effectiveRole, project_id: invite.project_id },
    });

    await client.query("COMMIT");

    return {
      org: {
        id: invite.org_id,
        name: invite.org_name,
        slug: invite.org_slug,
        role: effectiveRole,
        status: invite.org_status,
      },
      project_id: invite.project_id || null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Handles signup with an optional inviteToken.
 * If inviteToken is present:
 * - Validates invitation exists, is pending, not expired, and matches email (400 if invalid).
 * - Creates the user and executes invitation acceptance in the SAME transaction.
 * - Returns user and joined org/project details.
 */
export async function signupWithInvitation(
  name: string,
  email: string,
  hashedPassword: string,
  rawToken?: string
): Promise<{
  user: { id: number; name: string; email: string; is_super_admin: boolean; role?: string };
  joined: IAcceptInvitationResult | null;
}> {
  const normalizedEmail = email.toLowerCase().trim();
  const client = await pool.connect();

  try {
    let invite: any = null;

    if (rawToken) {
      const hash = hashToken(rawToken);
      const inviteRes = await client.query(
        `SELECT i.*, o.name AS org_name, o.slug AS org_slug, o.status AS org_status
         FROM invitations i
         JOIN organizations o ON o.id = i.org_id
         WHERE i.token_hash = $1`,
        [hash]
      );

      if (inviteRes.rows.length === 0) {
        throw new ValidationError("Invalid or expired invitation token");
      }

      invite = inviteRes.rows[0];
      const isExpired = new Date(invite.expires_at).getTime() <= Date.now();
      if (invite.status !== "pending" || isExpired) {
        throw new ValidationError("Invalid or expired invitation token");
      }

      if (normalizedEmail !== invite.email.toLowerCase().trim()) {
        throw new ValidationError("Signup email must match the invitation email");
      }
    }

    await client.query("BEGIN");

    // 1. Check if email already registered
    const existing = await client.query(
      "SELECT id FROM users WHERE LOWER(email) = $1",
      [normalizedEmail]
    );
    if (existing.rows.length > 0) {
      throw new ConflictError("User with this email already exists");
    }

    // 2. Create user record
    const userRes = await client.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, 'contributor')
       RETURNING id, name, email, is_super_admin, role`,
      [name, normalizedEmail, hashedPassword]
    );
    const newUser = userRes.rows[0];

    let joined: IAcceptInvitationResult | null = null;

    // 3. If invitation present, join org & project inside the same transaction
    if (invite) {
      if (invite.project_id) {
        // Client invite -> org role 'guest'
        await client.query(
          `INSERT INTO organization_members (org_id, user_id, role)
           VALUES ($1, $2, 'guest')
           ON CONFLICT (org_id, user_id) DO NOTHING`,
          [invite.org_id, newUser.id]
        );

        // Project membership -> client approved
        await client.query(
          `INSERT INTO project_members (project_id, user_id, role, status, decided_by, decided_at)
           VALUES ($1, $2, 'client', 'approved', $3, NOW())
           ON CONFLICT (project_id, user_id)
           DO UPDATE SET role = 'client', status = 'approved', decided_by = $3, decided_at = NOW()`,
          [invite.project_id, newUser.id, invite.invited_by]
        );
      } else {
        // Org invite -> org role invite.role
        await client.query(
          `INSERT INTO organization_members (org_id, user_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (org_id, user_id) DO UPDATE SET role = $3`,
          [invite.org_id, newUser.id, invite.role]
        );
      }

      // Mark invitation accepted
      await client.query(
        "UPDATE invitations SET status = 'accepted' WHERE id = $1",
        [invite.id]
      );

      const effectiveRole = invite.project_id ? "guest" : invite.role;
      joined = {
        org: {
          id: invite.org_id,
          name: invite.org_name,
          slug: invite.org_slug,
          role: effectiveRole,
          status: invite.org_status,
        },
        project_id: invite.project_id || null,
      };
    }

    await client.query("COMMIT");

    return {
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        is_super_admin: !!newUser.is_super_admin,
        role: newUser.role,
      },
      joined,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface IMyPendingInvitation {
  id: number;
  org_id: number;
  org_name: string;
  project_id: number | null;
  project_name: string | null;
  role: string;
  invited_by_name: string;
  expires_at: string;
  created_at: string;
}

/**
 * Lists all active, non-expired pending invitations for a user's email.
 */
export async function listMyPendingInvitations(
  email: string
): Promise<IMyPendingInvitation[]> {
  const result = await pool.query(
    `SELECT 
       i.id,
       i.org_id,
       i.project_id,
       i.role,
       i.expires_at,
       i.created_at,
       o.name AS org_name,
       p.name AS project_name,
       u.name AS invited_by_name
     FROM invitations i
     JOIN organizations o ON o.id = i.org_id
     LEFT JOIN projects p ON p.id = i.project_id
     JOIN users u ON u.id = i.invited_by
     WHERE LOWER(i.email) = LOWER($1)
       AND i.status = 'pending'
       AND i.expires_at > NOW()
     ORDER BY i.created_at DESC`,
    [email.trim()]
  );

  return result.rows;
}

/**
 * Directly accepts a pending invitation by ID for an authenticated user with matching email.
 */
export async function acceptInvitationById(
  invitationId: number,
  user: { id: number; email: string }
): Promise<IAcceptInvitationResult> {
  const result = await pool.query(
    `SELECT i.*, o.name AS org_name, o.slug AS org_slug, o.status AS org_status
     FROM invitations i
     JOIN organizations o ON o.id = i.org_id
     WHERE i.id = $1`,
    [invitationId]
  );

  if (result.rows.length === 0) {
    throw new ExpiredError("Invitation not found or no longer available");
  }

  const invite = result.rows[0];

  if (user.email.toLowerCase().trim() !== invite.email.toLowerCase().trim()) {
    throw new ForbiddenError("Logged-in user email does not match invitation email");
  }

  if (invite.status === "accepted") {
    const effectiveRole = invite.project_id ? "guest" : invite.role;
    return {
      org: {
        id: invite.org_id,
        name: invite.org_name,
        slug: invite.org_slug,
        role: effectiveRole,
        status: invite.org_status,
      },
      project_id: invite.project_id || null,
    };
  }

  if (invite.status !== "pending") {
    throw new ExpiredError("Invitation is expired, revoked, or already used");
  }

  if (new Date(invite.expires_at) <= new Date()) {
    await pool.query("UPDATE invitations SET status = 'expired' WHERE id = $1", [invite.id]);
    throw new ExpiredError("Invitation has expired");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (invite.project_id) {
      await client.query(
        `INSERT INTO organization_members (org_id, user_id, role)
         VALUES ($1, $2, 'guest')
         ON CONFLICT (org_id, user_id) DO NOTHING`,
        [invite.org_id, user.id]
      );

      await client.query(
        `INSERT INTO project_members (project_id, user_id, role, status, decided_by, decided_at)
         VALUES ($1, $2, 'client', 'approved', $3, NOW())
         ON CONFLICT (project_id, user_id)
         DO UPDATE SET role = 'client', status = 'approved', decided_by = $3, decided_at = NOW()`,
        [invite.project_id, user.id, invite.invited_by]
      );
    } else {
      await client.query(
        `INSERT INTO organization_members (org_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (org_id, user_id)
         DO UPDATE SET role = $3`,
        [invite.org_id, user.id, invite.role]
      );
    }

    await client.query(
      `UPDATE invitations
       SET status = 'accepted'
       WHERE id = $1`,
      [invite.id]
    );

    const effectiveRole = invite.project_id ? "guest" : invite.role;

    await logActivity(client, {
      orgId: invite.org_id,
      projectId: invite.project_id || null,
      actorId: user.id,
      action: "member.joined",
      metadata: { email: invite.email, role: effectiveRole, project_id: invite.project_id },
    });

    await client.query("COMMIT");

    return {
      org: {
        id: invite.org_id,
        name: invite.org_name,
        slug: invite.org_slug,
        role: effectiveRole,
        status: invite.org_status,
      },
      project_id: invite.project_id || null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
