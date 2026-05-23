import jwt from "jsonwebtoken";
import config from "../config";
import type { IJwtPayload } from "../types/user.type";


export const generateToken = (payload: IJwtPayload): string => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
};


export const verifyToken = (token: string): IJwtPayload | null => {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as IJwtPayload;
    return decoded;
  } catch (error) {
    return null;
  }
};
