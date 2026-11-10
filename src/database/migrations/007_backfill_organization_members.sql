-- Migration: 007_backfill_organization_members.sql
-- Description: Move existing users into the Default Organization based on current roles

DO $$
DECLARE
  v_org_id INTEGER;
  v_owner_id INTEGER;
BEGIN
  -- 1. Find Default Organization ID
  SELECT id INTO v_org_id FROM organizations WHERE slug = 'default';

  -- 2. Find the oldest user with role maintainer (or oldest user if none exists)
  SELECT id INTO v_owner_id
  FROM users
  WHERE role = 'maintainer'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    SELECT id INTO v_owner_id FROM users ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- 3. Update organizations.created_by to that owner
  IF v_owner_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    UPDATE organizations SET created_by = v_owner_id WHERE id = v_org_id;

    -- Oldest maintainer -> owner
    INSERT INTO organization_members (org_id, user_id, role, created_at)
    VALUES (v_org_id, v_owner_id, 'owner', NOW())
    ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner';

    -- Other maintainers -> admin
    INSERT INTO organization_members (org_id, user_id, role, created_at)
    SELECT v_org_id, id, 'admin', NOW()
    FROM users
    WHERE role = 'maintainer' AND id <> v_owner_id
    ON CONFLICT (org_id, user_id) DO NOTHING;

    -- Contributors -> member
    INSERT INTO organization_members (org_id, user_id, role, created_at)
    SELECT v_org_id, id, 'member', NOW()
    FROM users
    WHERE role = 'contributor' AND id <> v_owner_id
    ON CONFLICT (org_id, user_id) DO NOTHING;

    -- Clients -> guest
    INSERT INTO organization_members (org_id, user_id, role, created_at)
    SELECT v_org_id, id, 'guest', NOW()
    FROM users
    WHERE role = 'client' AND id <> v_owner_id
    ON CONFLICT (org_id, user_id) DO NOTHING;

    -- Any other user (fallback) -> member
    INSERT INTO organization_members (org_id, user_id, role, created_at)
    SELECT v_org_id, id, 'member', NOW()
    FROM users
    WHERE (role NOT IN ('maintainer', 'contributor', 'client') OR role IS NULL) AND id <> v_owner_id
    ON CONFLICT (org_id, user_id) DO NOTHING;
  END IF;
END $$;

-- Rollback:
-- DELETE FROM organization_members WHERE org_id = (SELECT id FROM organizations WHERE slug = 'default');

