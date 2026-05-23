# 🚀 DevPulse - Issue Tracker API

A simple and efficient REST API for tracking bugs and feature requests. Built with Node.js, TypeScript, and PostgreSQL.

## 📝 Summary

DevPulse helps development teams track issues and feature requests. Users can sign up, create issues, and manage them based on their role (contributor or maintainer).

**Live API:** https://dev-pulse-l2-a2.vercel.app

## ✨ Features

- 🔐 **User Authentication** - JWT-based signup and login
- 🐛 **Bug Tracking** - Report and track bugs
- ✨ **Feature Requests** - Submit and manage feature ideas
- 👥 **Role-Based Access** - Contributors and Maintainers with different permissions
- 🔒 **Secure** - Password hashing with bcrypt
- ☁️ **Cloud Deployed** - Hosted on Vercel with Neon PostgreSQL

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

## 🛣️ API Endpoints

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

## 📂 Project Structure

```
src/
├── config/          # Environment configuration
├── controller/      # Request handlers
│   ├── auth.controller.ts
│   └── issue.controller.ts
├── database/        # Database setup
│   ├── db.ts
│   ├── init.ts
│   └── schema.sql
├── middleware/      # Authentication middleware
│   └── auth.ts
├── routes/          # Route definitions
│   └── route.ts
├── service/         # Business logic
│   ├── user.service.ts
│   └── issue.service.ts
├── types/           # TypeScript types
│   ├── user.type.ts
│   └── issue.type.ts
├── utility/         # Helper functions
│   ├── jwt.ts
│   ├── password.ts
│   ├── parseBody.ts
│   └── sendResponse.ts
└── server.ts        # Main server file
```

## 🔧 Setup & Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd devpulse
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup environment variables**
```bash
cp .env.example .env
```

Edit `.env` with your values:
```env
PORT=5000
DATABASE_URL=your_neon_database_url
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=7d
BCRYPT_SALT_ROUNDS=10
```

4. **Initialize database**
```bash
npm run db:init
```

5. **Run development server**
```bash
npm run dev
```

## 🚀 Deployment

The project is configured for Vercel deployment:

```bash
npm run build
vercel deploy
```

## 📖 API Usage Examples

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

## 🧪 Testing

Use the included `api-tester.html` file to test all endpoints in your browser.

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Database:** PostgreSQL (Neon)
- **Authentication:** JWT + bcrypt
- **Deployment:** Vercel
- **Build Tool:** tsup

## 📜 Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run db:init      # Initialize database
```

## 👥 User Roles

- **Contributor:** Can create and update issues
- **Maintainer:** Can create, update, and delete issues

## 📄 License

ISC

---

Made with ❤️ for efficient issue tracking
