# DevPulse - Issue Tracking & Collaboration Platform

A modern, production-ready REST API for issue management and team collaboration. Built with Node.js, TypeScript, and PostgreSQL, featuring role-based access control, comprehensive commenting system, and secure authentication.

## About

DevPulse is a robust backend platform designed for development teams and client collaboration. It streamlines bug tracking, feature requests, and client feedback management with a RESTful architecture. The API features JWT-based authentication, role-based permissions (client, contributor, maintainer), and a rich commenting system for threaded discussions—all optimized for scalability and security with cloud deployment on Vercel and Neon PostgreSQL.

## Live Application

> Explore DevPulse in action:
>
> **🌐 https://devpulsev2.vercel.app/**
>
> Track issues, collaborate with teams, and deliver quality software

## Frontend Repo

> Explore DevPulse frontend:
>
> **🌐 https://github.com/FarhadNuri/DevPulse-Client**
>
>

## Features

- **User Authentication** - JWT-based signup and login
- **Bug Tracking** - Report and track bugs
- **Feature Requests** - Submit and manage feature ideas
- **Comments System** - Discussion threads on issues with author information
- **Role-Based Access** - Contributors and Maintainers with different permissions
- **Secure** - Password hashing with bcrypt
- **Cloud Deployed** - Hosted on Vercel with Neon PostgreSQL

## 🗄️ Database Schema

### Users Table
```sql
- id (Primary Key)
- name
- email (Unique)
- password (Hashed)
- role (contributor | maintainer)
- created_at
- updated_at
```

### Issues Table
```sql
- id (Primary Key)
- title
- description (min 20 characters)
- type (bug | feature_request)
- status (open | in_progress | resolved)
- reporter_id (Foreign Key to users)
- created_at
- updated_at
```

### Comments Table
```sql
- id (Primary Key)
- issue_id (Foreign Key to issues, CASCADE on delete)
- author_id (Foreign Key to users, CASCADE on delete)
- body (Text, max 1000 characters)
- created_at
- updated_at
```

## API Endpoints

### Authentication
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/signup` | Create new account | No |
| POST | `/api/auth/login` | Login to account | No |

### Issues
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/issues` | Get all issues | No |
| GET | `/api/issues/:id` | Get single issue | No |
| POST | `/api/issues` | Create new issue | Yes |
| PATCH | `/api/issues/:id` | Update issue | Yes |
| DELETE | `/api/issues/:id` | Delete issue | Yes (Maintainer only) |

### Comments
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/issues/:id/comments` | Get all comments for an issue | No |
| POST | `/api/issues/:id/comments` | Add comment to an issue | Yes (All roles) |
| DELETE | `/api/comments/:id` | Delete a comment | Yes (Own comment or Maintainer) |

## Project Structure

```
src/
├── config/          # Environment configuration
├── controller/      # Request handlers
│   ├── auth.controller.ts
│   ├── issue.controller.ts
│   └── comment.controller.ts
├── database/        # Database setup
│   ├── db.ts
│   ├── init.ts
│   ├── schema.sql
│   ├── migrate-comments.sql
│   └── migrate-comments.ts
├── middleware/      # Authentication middleware
│   └── auth.ts
├── routes/          # Route definitions
│   └── route.ts
├── service/         # Business logic
│   ├── user.service.ts
│   ├── issue.service.ts
│   └── comment.service.ts
├── types/           # TypeScript types
│   ├── user.type.ts
│   ├── issue.type.ts
│   └── comment.type.ts
├── utility/         # Helper functions
│   ├── jwt.ts
│   ├── password.ts
│   ├── parseBody.ts
│   └── sendResponse.ts
└── server.ts        # Main server file
```


## API Usage Examples

### Signup
```bash
POST /api/auth/signup
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "contributor"
}
```

### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

### Create Issue
```bash
POST /api/issues
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "title": "Login page not working",
  "description": "Users cannot login on mobile devices",
  "type": "bug"
}
```

### Get All Issues
```bash
GET /api/issues
```

### Update Issue
```bash
PATCH /api/issues/1
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "status": "in_progress"
}
```

### Delete Issue (Maintainer only)
```bash
DELETE /api/issues/1
Authorization: Bearer <your-token>
```

### Get Comments for Issue
```bash
GET /api/issues/1/comments
```

### Add Comment to Issue
```bash
POST /api/issues/1/comments
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "body": "I'm experiencing the same issue on iOS 16"
}
```

### Delete Comment
```bash
DELETE /api/comments/5
Authorization: Bearer <your-token>
```


## Tech Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Database:** PostgreSQL (Neon)
- **Authentication:** JWT + bcrypt
- **Deployment:** Vercel
- **Build Tool:** tsup

## Developed By

**Farhad Nuri**

- Email: farhadnuri559@gmail.com

- GitHub: [@FarhadNuri](https://github.com/FarhadNuri)

- LinkedIn: [Farhad Nuri](https://www.linkedin.com/in/farhad-nuri-ba99a62a5/)

---

**⭐ Star this repo if you found it helpful!**

