import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export function validateJwtSecret(secret: string | undefined): string {
  if (!secret || !secret.trim()) {
    throw new Error("FATAL: JWT_SECRET environment variable is missing.");
  }
  return secret.trim();
}

const jwtSecret = validateJwtSecret(process.env.JWT_SECRET);

const config = {
  port: Number(process.env.PORT) || 5000,
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  appUrl: process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:5173",
  resendApiKey: process.env.RESEND_API_KEY || "",
  emailFrom: process.env.EMAIL_FROM || "DevPulse <noreply@devpulse.app>",
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
  },
};

export { config };
export default config;
