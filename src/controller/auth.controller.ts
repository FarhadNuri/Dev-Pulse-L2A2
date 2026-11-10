import type { IncomingMessage, ServerResponse } from "http";
import { parseBody } from "../utility/parseBody";
import { sendResponse } from "../utility/sendResponse";
import { hashPassword, verifyAndMigratePassword } from "../utility/password";
import { generateToken } from "../utility/jwt";
import { createUser, findUserByEmail } from "../service/user.service";
import * as invitationService from "../service/invitation.service";
import { StatusCodes } from "http-status-codes";
import { validateSchema, signupSchema, loginSchema } from "../validation";
import { checkRateLimit, resetRateLimit } from "../middleware/rateLimit";

export const signup = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const rawBody = await parseBody(req);
    const val = validateSchema(signupSchema, rawBody);

    if (!val.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, val.error);
    }

    const { name, email, password, inviteToken } = val.data;

    // Apply in-memory rate limiting per IP+email
    if (!checkRateLimit(req, res, email)) {
      return;
    }

    const hashedPassword = await hashPassword(password);
    const { user, joined } = await invitationService.signupWithInvitation(
      name,
      email,
      hashedPassword,
      inviteToken
    );

    const token = generateToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: (user.role as "contributor" | "maintainer" | "client") || "contributor",
    });

    return sendResponse(
      res,
      StatusCodes.CREATED,
      true,
      "User registered successfully",
      {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          is_super_admin: user.is_super_admin,
        },
        joined,
      },
    );
  } catch (error) {
    if (error instanceof invitationService.ValidationError) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, error.message);
    }
    if (error instanceof invitationService.ConflictError) {
      return sendResponse(res, StatusCodes.CONFLICT, false, error.message);
    }
    console.error("Signup error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Something went wrong!",
    );
  }
};

export const login = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const rawBody = await parseBody(req);
    const val = validateSchema(loginSchema, rawBody);

    if (!val.success) {
      return sendResponse(res, StatusCodes.BAD_REQUEST, false, val.error);
    }

    const { email, password } = val.data;

    // Apply in-memory rate limiting per IP+email
    if (!checkRateLimit(req, res, email)) {
      return;
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return sendResponse(
        res,
        StatusCodes.UNAUTHORIZED,
        false,
        "Invalid email or password",
      );
    }

    // Verify password with automatic migration if stored as plain text
    const isPasswordValid = await verifyAndMigratePassword(
      password,
      user.password,
      user.id,
    );

    if (!isPasswordValid) {
      return sendResponse(
        res,
        StatusCodes.UNAUTHORIZED,
        false,
        "Invalid email or password",
      );
    }

    if (user.status === "disabled") {
      return sendResponse(
        res,
        StatusCodes.UNAUTHORIZED,
        false,
        "Account is disabled",
      );
    }

    // Reset rate limiter on successful authentication
    resetRateLimit(req, email);

    const token = generateToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      is_super_admin: !!(user as any).is_super_admin,
    });

    const { password: _pwd, ...userWithoutPassword } = user;

    return sendResponse(res, StatusCodes.OK, true, "Login successful", {
      token,
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error("Login error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Something went wrong!",
    );
  }
};
