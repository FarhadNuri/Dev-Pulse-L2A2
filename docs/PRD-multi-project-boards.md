# PRD: Multi-Project Boards with Permission-Based Access

**Feature branch:** `feature/multi-project-boards`
**Product:** DevPulse

## 1. Problem

DevPulse currently has one global board. We need to split it into **projects**, each with its own board, gate contributor access behind a maintainer approval step, and let a project have more than one maintainer.

## 2. Goals

| # | Requirement |
|---|---|
| 1 | Maintainer lands on a **grid of project cards**, not a board |
| 2 | Maintainer can **create a project** (name only) → creates an empty board, and becomes its first maintainer |
| 3 | Maintainer can **add tasks** inside a project's board |
| 4 | Contributor lands on a **grid of all projects** (across all maintainers) |
| 5 | Contributor without access sees a **locked card** with a "Request Access" option |
| 6 | Request goes to a project maintainer, who can **Approve / Reject** it |
| 7 | On approval, contributor can open that project's board |
| 8 | A project maintainer can **revoke** an approved contributor's access at any time |
| 9 | A project can have **more than one maintainer**; any existing maintainer of a project can add another user as a maintainer of that project |

## 3. Out of Scope (v1)

- Removing a maintainer from a project (once added, a maintainer stays unless this is built later)
- Transferring project ownership
- Project deletion/archiving
- Real-time notifications (manual refresh/polling is fine)

## 4. Roles & Flows

Two separate things determine what a person can do on a project:
- Their **global account role** (`maintainer` or `contributor`, set at signup) — controls whether they *can* create projects or *can* be added as a project maintainer at all.
- Their **membership on a specific project** — whether they're a maintainer of that project, an approved contributor, pending, rejected, or revoked.

| Role | Landing page | Can do |
|---|---|---|
| Maintainer (global) | Project grid (only projects where they're a maintainer) | Create project, open boards they maintain, manage tasks, approve/reject/revoke contributor requests, add other maintainers |
| Contributor (global) | Project grid (all projects, any maintainer) | Open a board only if approved; otherwise request access |

**Flow A – Create project:** Maintainer clicks "New Project" → enters name → empty board created, creator becomes the project's first maintainer → grid refreshes.

**Flow B – Work a board:** Maintainer clicks a project they maintain → board loads, scoped to that project.

**Flow C – Request access:** Contributor clicks a locked card → sees "Request Access" instead of the board → clicks it → card shows "Pending".

**Flow D – Approve/reject:** A maintainer of that project opens it → sees pending requests → approves or rejects → approved contributor can now open the board.

**Flow E – Revoke access:** A maintainer of the project opens the list of approved contributors → clicks "Revoke" next to one → that contributor immediately loses board access and can request again later.

**Flow F – Add a maintainer:** An existing maintainer of the project opens "Manage Maintainers" → picks another user with a maintainer account → adds them → that user immediately maintains the project too (no approval step needed, since only maintainer-role accounts are eligible).

## 5. What Needs to Be Built

**Data model**
- `projects` table (id, name, created_by, created_at) — `created_by` is kept for record-keeping ("originally created by"), but is no longer the sole source of truth for who can manage the project.
- `project_members` table replaces the old single-purpose access table. It tracks **everyone** attached to a project — both maintainers and contributors:
  - project_id, user_id, role (`maintainer` | `contributor`), status (`pending` | `approved` | `rejected` | `revoked`), requested_at, decided_at.
  - A maintainer row is inserted as `approved` immediately (no request step).
  - A contributor row starts as `pending` and moves to `approved` / `rejected` / `revoked`.
- `issues` table keeps its `project_id` column.

**Backend**
- Create project (maintainer-role account only) → also creates the creator's `maintainer`/`approved` membership row.
- List projects (maintainer → projects they're a member of; contributor → all projects + their own membership status).
- Get single project (allowed only if the requester has an `approved` membership row, any role).
- Request access (contributor-role account, creates/resets a `pending` contributor row).
- List pending contributor requests for a project (any maintainer of that project).
- Approve/reject a contributor request (any maintainer of that project).
- **Revoke** an approved contributor's access (any maintainer of that project) — sets status to `revoked`; a revoked contributor can request access again later.
- **Add a maintainer** to a project (any existing maintainer of that project; target user must already have a maintainer-role account) — inserts an `approved` maintainer row immediately.
- List a project's maintainers (for the "Manage Maintainers" UI).
- Scope all issue endpoints (list/create/update/delete/comments) to a project, and require an approved membership row before allowing them.

**Frontend**
- Projects grid page (default landing page for both roles).
- Project card (open button / lock+pending badge / request-access button, depending on membership state).
- New Project modal (name field only).
- Access Requests panel (maintainers only) — approve/reject pending contributors.
- Contributors list on a project (maintainers only) — shows approved contributors with a **Revoke** button.
- Manage Maintainers panel (maintainers only) — shows current maintainers, lets a maintainer add another eligible user.
- Routing so a project's board only renders after confirming an approved membership; direct URL access without permission must be blocked too, and a revoked contributor loses access immediately even mid-session on next request.

## 6. Acceptance Criteria

- [ ] Maintainer with zero projects sees an empty grid + "New Project" button
- [ ] Creating a project only asks for a name, then shows an empty board, and the creator is that project's first maintainer
- [ ] Contributor sees every project as a card, locked unless approved
- [ ] Requesting access twice does not create duplicate pending rows
- [ ] Any maintainer of a project (not just the creator) sees and can act on that project's pending requests
- [ ] Approved contributor can open the board and see/add issues
- [ ] Rejected contributor sees "Rejected" and can request again
- [ ] A maintainer can revoke an approved contributor; that contributor immediately loses board access and can request access again
- [ ] A maintainer can add another maintainer-role user to the project; that user immediately gets maintainer access, no approval step
- [ ] Access is enforced on the backend, not just hidden in the UI
