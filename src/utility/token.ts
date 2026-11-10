import crypto from "crypto";

/**
 * Generates a secure random 32-byte hex token and its SHA-256 hash.
 * The raw token is sent to the user via email link; only the hash is stored in the database.
 */
export function generateInviteToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  const hash = hashToken(token);
  return { token, hash };
}

/**
 * Computes SHA-256 hash of a plaintext token.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

