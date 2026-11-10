-- Migration: 006_projects_add_org_id_and_archived_at.sql
-- Description: Add org_id and archived_at to projects, create Default Organization, backfill existing projects

ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

-- 1. Ensure Default Organization exists (use oldest maintainer or user as creator)
INSERT INTO organizations (name, slug, status, created_by, created_at)
VALUES (
  'Default Organization',
  'default',
  'active',
  (SELECT id FROM users ORDER BY (role = 'maintainer') DESC, created_at ASC LIMIT 1),
  NOW()
)
ON CONFLICT (slug) DO NOTHING;

-- 2. Add org_id column referencing organizations(id)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id);

-- 3. Backfill org_id on existing projects
UPDATE projects
SET org_id = (SELECT id FROM organizations WHERE slug = 'default')
WHERE org_id IS NULL;

-- 4. Set default value so v1 app createProject (which doesn't supply org_id yet) keeps working seamlessly
DO $$
DECLARE
  v_default_org_id INTEGER;
BEGIN
  SELECT id INTO v_default_org_id FROM organizations WHERE slug = 'default';
  IF v_default_org_id IS NOT NULL THEN
    EXECUTE format('ALTER TABLE projects ALTER COLUMN org_id SET DEFAULT %s', v_default_org_id);
  END IF;
END $$;

-- 5. Enforce NOT NULL constraint
ALTER TABLE projects ALTER COLUMN org_id SET NOT NULL;

-- 6. Add index on projects(org_id)
CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(org_id);

-- Rollback:
-- DROP INDEX IF EXISTS idx_projects_org_id;
-- ALTER TABLE projects ALTER COLUMN org_id DROP DEFAULT;
-- ALTER TABLE projects DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE projects DROP COLUMN IF EXISTS archived_at;

