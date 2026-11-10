-- Migration 016: Create platform_audit_log table

CREATE TABLE IF NOT EXISTS platform_audit_log (
  id SERIAL PRIMARY KEY,
  actor_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id INT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_log_actor_id ON platform_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_log_action ON platform_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_platform_audit_log_created_at ON platform_audit_log(created_at DESC);

