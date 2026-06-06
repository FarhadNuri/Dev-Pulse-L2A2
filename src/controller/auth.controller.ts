import type { IncomingMessage, ServerResponse } from "http";
import { parseBody } from "../utility/parseBody";
import { sendResponse } from "../utility/sendResponse";
import { hashPassword, comparePassword } from "../utility/password";
import { generateToken } from "../utility/jwt";
import { createUser, findUserByEmail } from "../service/user.service";
import { StatusCodes } from "http-status-codes";
import type { ISignupRequest, ILoginRequest } from "../types/user.type";


export const signup = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const body: ISignupRequest = await parseBody(req);

    if (!body.name || !body.email || !body.password) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Name, email, and password are required",
      );
    }

    const existingUser = await findUserByEmail(body.email);
    if (existingUser) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "User with this email already exists",
      );
    }

    const role = body.role || "contributor";
    if (role !== "contributor" && role !== "maintainer" && role !== "client") {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Role must be 'contributor', 'maintainer', or 'client'",
      );
    }

    const hashedPassword = await hashPassword(body.password);

    const newUser = await createUser(body.name, body.email, hashedPassword, role);

    return sendResponse(
      res,
      StatusCodes.CREATED,
      true,
      "User registered successfully",
      newUser,
    );
  } catch (error) {
    console.error("Signup error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Something went wrong!",
      undefined,
      error,
    );
  }
};

export const login = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const body: ILoginRequest = await parseBody(req);

    if (!body.email || !body.password) {
      return sendResponse(
        res,
        StatusCodes.BAD_REQUEST,
        false,
        "Email and password are required",
      );
    }

    const user = await findUserByEmail(body.email);
    if (!user) {
      return sendResponse(
        res,
        StatusCodes.UNAUTHORIZED,
        false,
        "Invalid email or password",
      );
    }

    const isPasswordValid = await comparePassword(body.password, user.password);
    if (!isPasswordValid) {
      return sendResponse(
        res,
        StatusCodes.UNAUTHORIZED,
        false,
        "Invalid email or password",
      );
    }

    const token = generateToken({
      id: user.id,
      name: user.name,
      role: user.role,
    });


    const { password, ...userWithoutPassword } = user;

    return sendResponse(
      res,
      StatusCodes.OK,
      true,
      "Login successful",
      {
        token,
        user: userWithoutPassword,
      },
    );
  } catch (error) {
    console.error("Login error:", error);
    return sendResponse(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      false,
      "Something went wrong!",
      undefined,
      error,
    );
  }
};
