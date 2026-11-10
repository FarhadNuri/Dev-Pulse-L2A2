-- Migration: 008_project_members_target_model.sql
-- Description: Backup project_members, add decided_by, clean up maintainer rows, update constraints

-- 1. Create backup table if it doesn't already exist
CREATE TABLE IF NOT EXISTS project_members_backup_v1 AS
SELECT * FROM project_members;

-- 2. Add decided_by column referencing users(id)
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS decided_by INTEGER REFERENCES users(id);

-- 3. Remove rows that represent maintainers of a project (maintainers are now org owner/admin)
DELETE FROM project_members WHERE role = 'maintainer';

-- 4. Update check constraints:
-- Include 'maintainer' in role check for backward compatibility with v1 project creation until Phase 1 endpoints replace it
ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_role_check;
ALTER TABLE project_members ADD CONSTRAINT project_members_role_check
  CHECK (role IN ('contributor', 'client', 'maintainer'));

ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_status_check;
ALTER TABLE project_members ADD CONSTRAINT project_members_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'revoked'));

-- Rollback:
-- TRUNCATE TABLE project_members;
-- INSERT INTO project_members SELECT * FROM project_members_backup_v1;
-- ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_status_check;
-- ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_role_check;
-- ALTER TABLE project_members DROP COLUMN IF EXISTS decided_by;
-- DROP TABLE IF EXISTS project_members_backup_v1;

