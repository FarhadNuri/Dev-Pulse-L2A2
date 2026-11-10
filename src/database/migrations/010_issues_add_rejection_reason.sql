-- Migration: 010_issues_add_rejection_reason.sql
-- Description: Add rejection_reason column to issues table

ALTER TABLE issues ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;

-- Rollback:
-- ALTER TABLE issues DROP COLUMN IF EXISTS rejection_reason;

