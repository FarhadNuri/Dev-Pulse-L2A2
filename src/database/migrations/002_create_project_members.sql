CREATE TABLE IF NOT EXISTS project_members (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  role VARCHAR(20) NOT NULL,             -- 'maintainer' | 'contributor'
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | approved | rejected | revoked
  requested_at TIMESTAMP DEFAULT NOW(),
  decided_at TIMESTAMP,
  UNIQUE(project_id, user_id)
);
