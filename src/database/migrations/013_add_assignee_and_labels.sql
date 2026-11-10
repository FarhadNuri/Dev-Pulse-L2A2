-- Migration: 013_add_assignee_and_labels.sql
-- Description: Add assignee_id to issues, create labels and issue_labels tables, add indexes

-- 1. Add assignee_id to issues table
ALTER TABLE issues
ADD COLUMN IF NOT EXISTS assignee_id INT NULL REFERENCES users(id) ON DELETE SET NULL;

-- 2. Create labels table
CREATE TABLE IF NOT EXISTS labels (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_labels_org_name UNIQUE (org_id, name)
);

-- 3. Create issue_labels join table
CREATE TABLE IF NOT EXISTS issue_labels (
    issue_id INT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    label_id INT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (issue_id, label_id)
);

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_issues_project_id_status ON issues(project_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_project_id_assignee ON issues(project_id, assignee_id);
CREATE INDEX IF NOT EXISTS idx_labels_org_id ON labels(org_id);
CREATE INDEX IF NOT EXISTS idx_issue_labels_issue_id ON issue_labels(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_labels_label_id ON issue_labels(label_id);

