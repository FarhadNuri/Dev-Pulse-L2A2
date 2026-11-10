-- Migration: 017_cascade_delete_org_and_projects.sql
-- Description: Update foreign keys to ON DELETE CASCADE for clean organization and project deletions

-- 1. Cascade projects when organization is deleted
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_org_id_fkey;
ALTER TABLE projects ADD CONSTRAINT projects_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- 2. Cascade issues when project is deleted
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_project_id_fkey;
ALTER TABLE issues ADD CONSTRAINT issues_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 3. Cascade project_members when project is deleted
ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_project_id_fkey;
ALTER TABLE project_members ADD CONSTRAINT project_members_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

