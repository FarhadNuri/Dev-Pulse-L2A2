import type { IncomingMessage } from "http";
import type { IJwtPayload } from "./user.type";

export type OrgRole = "owner" | "admin" | "member" | "guest";
export type OrgStatus = "active" | "suspended";

export interface IOrg {
  id: number;
  name: string;
  slug: string;
  status: OrgStatus;
  created_by?: number | null;
  created_at?: string;
}

export interface IOrgSummary {
  id: number;
  name: string;
  slug: string;
  role: OrgRole;
  status: OrgStatus;
}

export interface IOrgDetail extends IOrg {
  my_role: OrgRole;
  member_count: number;
  project_count: number;
}

export interface IOrgMember {
  user_id: number;
  name: string;
  email: string;
  role: OrgRole;
  joined_at: string;
}

export interface ICreateOrgRequest {
  name: string;
}

export interface IUpdateOrgRequest {
  name?: string;
}

export interface IUpdateMemberRoleRequest {
  role: "admin" | "member";
}

export interface ITransferOwnershipRequest {
  userId: number;
}

export interface OrgRequest extends IncomingMessage {
  user?: IJwtPayload;
  org?: IOrg;
  orgRole?: OrgRole;
  actingAsSuperAdmin?: boolean;
  params?: Record<string, any>;
}

