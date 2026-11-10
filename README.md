# DevPulse API - Multi-Tenant Issue Tracking & Client Collaboration Platform

A production-ready, high-performance REST API for multi-tenant software issue tracking, client delivery management, and team collaboration. Built with **Node.js**, **TypeScript**, and **PostgreSQL (Neon)** with pure SQL connection pooling, zero ORM overhead, and strict row-level tenant isolation.

---

## Live Links & Repositories

- **Live Application:** [https://devpulsev2.vercel.app](https://devpulsev2.vercel.app)
- **Frontend Repository:** [DevPulse-Client (React + TypeScript + Vite + Tailwind CSS)](https://github.com/FarhadNuri/DevPulse-Client)
- **Backend Repository:** [DevPulse API (Node.js + TypeScript + PostgreSQL)](https://github.com/FarhadNuri/Dev-Pulse-L2A2)

---



## Core Features

- **Multi-Tenant Workspaces (Organizations):** Create and manage isolated company workspaces with custom slugs, member rosters, and ownership transfers.
- **Project Workspaces & Archiving:** Create projects inside organizations, manage active Kanban boards, and safely archive completed projects.
- **Project Access Workflow:** Teammates request access to projects inside their organization; maintainers approve or reject access requests.
- **Client & Guest Portals:** Invite external stakeholders with scoped permissions so they only see the single project they are assigned to.
- **Kanban Issue Lifecycle:** `pending` ➔ `open` ➔ `in_progress` ➔ `resolved` ➔ `closed` / `rejected`.
- **Priority, Assignees & Custom Labels:** Categorize issues by priority (`urgent`, `high`, `medium`, `low`), assign tickets to teammates, and attach color-coded organization labels.
- **Discussion Threads & Mentions:** Add comments with author timestamps, suggest teammate `@mentions`, and manage attachment records.
- **Token-Based Public Invitations:** Generate invitation links with expiration tokens for organization members and client guests.
- **Super Admin Platform Console:** Global platform dashboard with system-wide analytics, user status toggling (active/suspended), super admin promotion/demotion, organization lifecycle management, and cascade deletions.

---


## Complete API Reference

All requests accept and return `application/json`. Authenticated routes require an `Authorization: Bearer <jwt_token>` header.

### 1. Authentication & Profile
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/signup` | Register a new user account | No |
| `POST` | `/api/auth/login` | Log in and receive a JWT token | No |
| `GET` | `/api/me` | Fetch authenticated user profile & user organizations | **Yes** |

### 2. Organizations (Workspaces)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/orgs` | Create a new organization workspace | **Yes** |
| `GET` | `/api/orgs` | List organizations the authenticated user belongs to | **Yes** |
| `GET` | `/api/orgs/:id` | Get organization details (members, stats) | **Yes** (Member) |
| `PATCH` | `/api/orgs/:id` | Update organization name or slug | **Yes** (Owner/Maintainer) |
| `GET` | `/api/orgs/:id/members` | List members of an organization | **Yes** (Member) |
| `PATCH` | `/api/orgs/:id/members/:userId` | Update member organization role | **Yes** (Owner/Maintainer) |
| `DELETE` | `/api/orgs/:id/members/:userId` | Remove member from organization | **Yes** (Owner/Maintainer) |
| `POST` | `/api/orgs/:id/transfer-ownership` | Transfer workspace ownership | **Yes** (Owner only) |

### 3. Projects
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/orgs/:orgId/projects` | Create a new project in an organization | **Yes** (Maintainer) |
| `GET` | `/api/orgs/:orgId/projects` | List visible projects in an organization | **Yes** (Member) |
| `GET` | `/api/projects/:id` | Get single project details (cloaked 404 if unauthorized) | **Yes** (Project Member) |
| `PATCH` | `/api/projects/:id` | Update project name or description | **Yes** (Maintainer) |
| `POST` | `/api/projects/:id/archive` | Archive or unarchive a project | **Yes** (Maintainer) |

### 4. Project Access & Members
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/projects/:id/members` | List assigned members of a project | **Yes** (Project Member) |
| `POST` | `/api/projects/:id/members` | Add a member directly to a project | **Yes** (Maintainer) |
| `DELETE` | `/api/projects/:id/members/:userId` | Revoke user access to a project | **Yes** (Maintainer) |
| `POST` | `/api/projects/:id/access-requests` | Request access to join a project | **Yes** (Org Member) |
| `GET` | `/api/projects/:id/access-requests` | List pending project access requests | **Yes** (Maintainer) |
| `POST` | `/api/projects/:id/access-requests/:reqId/decide` | Approve or deny project access request | **Yes** (Maintainer) |

### 5. Issues & Triage Gate
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/projects/:id/issues` | Create issue (guest submissions enter `pending` state) | **Yes** |
| `GET` | `/api/projects/:id/issues` | List active board issues with search and filters | **Yes** (Project Member) |
| `GET` | `/api/issues/:id` | Get issue details, assignee, labels, and activity | **Yes** (Project Member) |
| `PATCH` | `/api/issues/:id` | Update issue (status, title, priority, assignee, labels) | **Yes** (Project Member) |
| `DELETE` | `/api/issues/:id` | Delete issue | **Yes** (Maintainer only) |
| `GET` | `/api/projects/:id/issues/pending` | List issues waiting in triage approval queue | **Yes** (Maintainer) |
| `POST` | `/api/issues/:id/approval` | Approve issue to board or reject with documented reason | **Yes** (Maintainer) |
| `POST` | `/api/issues/:id/resubmit` | Edit and resubmit a rejected ticket for re-review | **Yes** (Reporter) |
| `GET` | `/api/my-requests` | List tickets submitted by current user across projects | **Yes** |

### 6. Comments & Attachments
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/issues/:id/comments` | List discussion comments for an issue | **Yes** (Project Member) |
| `POST` | `/api/issues/:id/comments` | Add comment with body, mentions, and attachments | **Yes** (Project Member) |
| `DELETE` | `/api/comments/:id` | Delete comment | **Yes** (Author / Maintainer) |
| `GET` | `/api/projects/:id/mentionable-users` | List eligible teammates for `@` mentions | **Yes** (Project Member) |
| `POST` | `/api/attachments/sign` | Generate signed upload URL for file attachments | **Yes** |
| `POST` | `/api/attachments` | Record attachment metadata for an issue | **Yes** |
| `DELETE` | `/api/attachments/:id` | Delete an attachment record | **Yes** |

### 7. Invitations
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/orgs/:orgId/invitations` | Invite a teammate to join an organization | **Yes** (Maintainer) |
| `POST` | `/api/projects/:id/invitations/client` | Create scoped guest link for an external client | **Yes** (Maintainer) |
| `GET` | `/api/orgs/:orgId/invitations` | List sent invitations for an organization | **Yes** (Maintainer) |
| `DELETE` | `/api/invitations/:id` | Revoke a pending invitation | **Yes** (Maintainer) |
| `POST` | `/api/invitations/:id/resend` | Resend invitation email | **Yes** (Maintainer) |
| `GET` | `/api/invitations/public/:token` | Inspect public invitation details without logging in | No |
| `POST` | `/api/invitations/accept` | Accept an invitation token (new or existing user) | No / **Yes** |
| `GET` | `/api/invitations/my-pending` | List pending invitations sent to authenticated user email | **Yes** |
| `POST` | `/api/invitations/my-pending/:id/accept` | Accept an in-app pending invitation | **Yes** |

### 8. Activity Log
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/projects/:id/activity` | List immutable activity stream for a project | **Yes** (Project Member) |
| `GET` | `/api/issues/:id/activity` | List chronological status changes for an issue | **Yes** (Project Member) |
| `GET` | `/api/orgs/:id/activity` | List workspace-wide activity stream | **Yes** (Org Member) |

### 9. Custom Labels
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/orgs/:orgId/labels` | List custom labels created in an organization | **Yes** (Org Member) |
| `POST` | `/api/orgs/:orgId/labels` | Create a custom label (name, color) | **Yes** (Maintainer) |
| `PATCH` | `/api/labels/:id` | Update label name or color | **Yes** (Maintainer) |
| `DELETE` | `/api/labels/:id` | Delete a label | **Yes** (Maintainer) |

### 10. Super Admin Console
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/admin/stats` | Global metrics (users, orgs, projects, issues, pending) | **Yes** (Super Admin) |
| `GET` | `/api/admin/orgs` | List all platform organizations with member & project counts | **Yes** (Super Admin) |
| `GET` | `/api/admin/orgs/:id` | Inspect detailed organization records and projects | **Yes** (Super Admin) |
| `PATCH` | `/api/admin/orgs/:id/status` | Suspend or activate an organization | **Yes** (Super Admin) |
| `DELETE` | `/api/admin/orgs/:id` | Safe cascade delete organization and all project data | **Yes** (Super Admin) |
| `GET` | `/api/admin/users` | List all platform users with roles and status | **Yes** (Super Admin) |
| `GET` | `/api/admin/users/:id` | Inspect user profile, memberships, and activity | **Yes** (Super Admin) |
| `PATCH` | `/api/admin/users/:id/status` | Toggle user status (`active` / `suspended`) | **Yes** (Super Admin) |
| `PATCH` | `/api/admin/users/:id/super-admin`| Promote or demote user Super Admin status | **Yes** (Super Admin) |
| `GET` | `/api/admin/projects` | List all projects across all organizations | **Yes** (Super Admin) |
| `GET` | `/api/admin/issues` | List all tickets across the entire platform | **Yes** (Super Admin) |

---

## Project Structure

```
D:/Dev-Pulse-L2A2/
├── scripts/                          # Maintenance, migration, and seed scripts
│   ├── runMigrations.ts              # Sequential SQL migration executor (001-017)
│   ├── seedBangladeshiOrg.ts         # Real-world benchmark workspace seed script
│   ├── seedSuperAdmin.ts             # Super Admin provisioning script
│   └── test_hardening.ts             # Security, access control, and tenant isolation tests
├── src/
│   ├── config/                       # Environment and global configuration
│   ├── controller/                   # HTTP Request Controllers
│   │   ├── access.controller.ts      # Project access requests and membership
│   │   ├── activity.controller.ts    # Project, issue, and organization activity logs
│   │   ├── admin.controller.ts       # Super Admin metrics and platform controls
│   │   ├── attachment.controller.ts  # Signed upload URL and attachment records
│   │   ├── auth.controller.ts        # Signup and login authentication
│   │   ├── comment.controller.ts     # Comment threads and mentionable users
│   │   ├── invitation.controller.ts  # Workspace and client invitations
│   │   ├── issue.controller.ts       # Issues, triage gate, and approval workflows
│   │   ├── label.controller.ts       # Custom organization tags/labels
│   │   ├── org.controller.ts         # Organizations and workspace members
│   │   └── project.controller.ts     # Project CRUD and archiving
│   ├── database/
│   │   ├── migrations/               # 001 - 017 Sequential SQL migration files
│   │   │   ├── 001_create_projects.sql
│   │   │   ├── 002_create_project_members.sql
│   │   │   ├── 003_add_project_id_to_issues.sql
│   │   │   ├── 004_create_organizations.sql
│   │   │   ├── 005_users_add_super_admin_and_status.sql
│   │   │   ├── 006_projects_add_org_id_and_archived_at.sql
│   │   │   ├── 007_backfill_organization_members.sql
│   │   │   ├── 008_project_members_target_model.sql
│   │   │   ├── 009_add_existing_table_indexes.sql
│   │   │   ├── 010_issues_add_rejection_reason.sql
│   │   │   ├── 011_projects_add_description.sql
│   │   │   ├── 012_create_invitations.sql
│   │   │   ├── 013_add_assignee_and_labels.sql
│   │   │   ├── 014_create_activity_log.sql
│   │   │   ├── 015_add_comment_mentions_and_attachments.sql
│   │   │   ├── 016_create_platform_audit_log.sql
│   │   │   └── 017_cascade_delete_org_and_projects.sql
│   │   ├── db.ts                     # Connection pool instance (pg.Pool)
│   │   ├── init.ts                   # Database connection verify script
│   │   └── schema.sql                # Full consolidated baseline schema
│   ├── middleware/                   # Security, Authentication & Scoping Guards
│   │   ├── auth.ts                   # JWT verification & active user guard
│   │   ├── rateLimit.ts              # IP and user rate limiting
│   │   ├── requireOrgAccess.ts       # Organization membership guard
│   │   ├── requireOrgRole.ts         # Role level checks (owner, maintainer)
│   │   ├── requireProjectAccess.ts   # Project access guard & cloaked 404 handler
│   │   ├── requireSuperAdmin.ts      # Super Admin role verification
│   │   └── securityHeaders.ts        # HSTS, CORS, and security headers
│   ├── routes/
│   │   └── route.ts                  # Central API router & request dispatcher
│   ├── service/                      # Business Logic & SQL Queries
│   │   ├── access.service.ts
│   │   ├── activity.service.ts
│   │   ├── admin.service.ts
│   │   ├── attachment.service.ts
│   │   ├── comment.service.ts
│   │   ├── email.service.ts
│   │   ├── invitation.service.ts
│   │   ├── issue.service.ts
│   │   ├── label.service.ts
│   │   ├── org.service.ts
│   │   ├── project.service.ts
│   │   └── user.service.ts
│   ├── types/                        # TypeScript Interfaces & Enums
│   ├── utility/                      # Helper Functions (JWT, Passwords, Slugs, Responses)
│   ├── validation/                   # Zod Schemas for Request Validation
│   └── server.ts                     # HTTP Server Entry Point
├── .env.example                      # Sample environment variables
├── package.json                      # Dependencies and npm scripts
├── tsconfig.json                     # TypeScript compiler configuration
└── tsup.config.ts                    # Build bundler configuration
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 18.0.0
- **PostgreSQL Database** (e.g., Neon cloud PostgreSQL or local PostgreSQL)

### 1. Clone Repository & Install Dependencies

```bash
git clone https://github.com/FarhadNuri/Dev-Pulse-L2A2.git
cd Dev-Pulse-L2A2
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory based on `.env.example`:

```env
PORT=5000
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>?sslmode=require
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=7d
BCRYPT_SALT_ROUNDS=10
FRONTEND_URL=http://localhost:5173
APP_URL=http://localhost:5173
RESEND_API_KEY=your_resend_api_key_or_empty
EMAIL_FROM=DevPulse <noreply@devpulse.app>
```

### 3. Run Database Migrations

Apply all 17 SQL migrations to your database:

```bash
npm run db:migrate:v2
```

### 4. Start the Development Server

```bash
npm run dev
```

The API will start listening at `http://localhost:5000`.

---



## Tech Stack

- **Runtime:** Node.js (>= 18.x)
- **Language:** TypeScript 5.x
- **Database:** PostgreSQL (Neon Serverless with Connection Pooling)
- **Database Driver:** `pg` (node-postgres with atomic transactions)
- **Validation:** Zod
- **Authentication:** JSON Web Tokens (`jsonwebtoken`) & `bcrypt`
- **Build & Bundler:** `tsup`
- **Execution:** `tsx`
- **Deployment:** Vercel Serverless / Cloud Node runtime

---

## Author & Contact

**Farhad Nuri**
- **Email:** farhadnuri559@gmail.com
- **GitHub:** [@FarhadNuri](https://github.com/FarhadNuri)
- **LinkedIn:** [Farhad Nuri](https://www.linkedin.com/in/farhad-nuri-ba99a62a5/)

---

⭐ **Star this repository if you find DevPulse useful!**
