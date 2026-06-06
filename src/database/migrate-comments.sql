CREATE TABLE IF NOT EXISTS comments (
  id         SERIAL PRIMARY KEY,
  issue_id   INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_issue_id ON comments(issue_id);
