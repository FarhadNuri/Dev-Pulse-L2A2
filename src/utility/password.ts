import bcrypt from "bcrypt";
import config from "../config";
import { pool } from "../database/db";

export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, config.bcryptSaltRounds);
};

export const isBcryptHash = (str: string): boolean => {
  if (typeof str !== "string") return false;
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(str);
};

export const comparePassword = async (
  password: string,
  hashedPassword: string,
): Promise<boolean> => {
  if (isBcryptHash(hashedPassword)) {
    return await bcrypt.compare(password, hashedPassword);
  }
  return password === hashedPassword;
};

/**
 * Verifies password and handles automatic migration from legacy plain/weak passwords.
 * If user logged in with an old plain text password, re-hashes with bcrypt and updates DB.
 */
export const verifyAndMigratePassword = async (
  plainPasswordAttempt: string,
  storedPassword: string,
  userId: number,
): Promise<boolean> => {
  // If stored password is valid bcrypt hash:
  if (isBcryptHash(storedPassword)) {
    return await bcrypt.compare(plainPasswordAttempt, storedPassword);
  }

  // Plain text or legacy weak hash migration check:
  if (plainPasswordAttempt === storedPassword) {
    const newHash = await hashPassword(plainPasswordAttempt);
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [
      newHash,
      userId,
    ]);
    return true;
  }

  return false;
};
