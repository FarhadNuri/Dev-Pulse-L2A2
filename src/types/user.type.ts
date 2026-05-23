export interface IUser {
  id: number;
  name: string;
  email: string;
  password: string;
  role: "contributor" | "maintainer";
  created_at: string;
  updated_at: string;
}

export interface IUserResponse {
  id: number;
  name: string;
  email: string;
  role: "contributor" | "maintainer";
  created_at: string;
  updated_at: string;
}

export interface ISignupRequest {
  name: string;
  email: string;
  password: string;
  role?: "contributor" | "maintainer";
}

export interface ILoginRequest {
  email: string;
  password: string;
}

export interface IJwtPayload {
  id: number;
  name: string;
  role: "contributor" | "maintainer";
}
