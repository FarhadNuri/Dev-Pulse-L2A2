import { pool } from "../database/db";
import type { IUser, IUserResponse } from "../types/user.type";

export const createUser = async (
  name: string,
  email: string,
  hashedPassword: string,
  role: string,
): Promise<IUserResponse> => {
  const query = `
    INSERT INTO users (name, email, password, role)
    VALUES ($1, $2, $3, $4)
    RETURNING id, name, email, role, created_at, updated_at
  `;
  const values = [name, email, hashedPassword, role];
  const result = await pool.query(query, values);
  return result.rows[0] as IUserResponse;
};

export const findUserByEmail = async (email: string): Promise<IUser | null> => {
  const query = "SELECT * FROM users WHERE email = $1";
  const result = await pool.query(query, [email]);
  return result.rows[0] || null;
};

export const findUserById = async (id: number): Promise<IUserResponse | null> => {
  const query = "SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = $1";
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
};

export const findUsersByIds = async (ids: number[]): Promise<IUserResponse[]> => {
  if (ids.length === 0) return [];
  
  const query = `SELECT id, name, role FROM users WHERE id = ANY($1)`;
  const result = await pool.query(query, [ids]);
  return result.rows;
};
