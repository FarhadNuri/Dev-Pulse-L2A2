-- Migration: 005_users_add_super_admin_and_status.sql
-- Description: Add is_super_admin and status to users table

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'status'
  ) THEN
    ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active';
    ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'disabled'));
  END IF;
END $$;

-- Rollback:
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
-- ALTER TABLE users DROP COLUMN IF EXISTS status;
-- ALTER TABLE users DROP COLUMN IF EXISTS is_super_admin;

