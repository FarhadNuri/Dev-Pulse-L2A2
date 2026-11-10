-- Migration: 014_create_activity_log.sql
-- Description: Create activity_log table and indexes

CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id INT NULL REFERENCES projects(id) ON DELETE CASCADE,
    issue_id INT NULL REFERENCES issues(id) ON DELETE CASCADE,
    actor_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_project_created ON activity_log(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_org_created ON activity_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_issue_created ON activity_log(issue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_project_id_desc ON activity_log(project_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_org_id_desc ON activity_log(org_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_issue_id_desc ON activity_log(issue_id, id DESC);

