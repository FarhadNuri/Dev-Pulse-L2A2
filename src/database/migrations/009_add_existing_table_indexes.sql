-- Migration: 009_add_existing_table_indexes.sql
-- Description: Add remaining suggested indexes for existing tables

CREATE INDEX IF NOT EXISTS idx_issues_project_id_status ON issues(project_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_search ON issues USING gin(to_tsvector('english', title || ' ' || description));

-- Rollback:
-- DROP INDEX IF EXISTS idx_issues_search;
-- DROP INDEX IF EXISTS idx_issues_project_id_status;

