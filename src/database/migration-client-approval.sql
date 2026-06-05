
ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(20);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('contributor', 'maintainer', 'client'));


ALTER TABLE issues ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'approved';


ALTER TABLE issues ADD COLUMN IF NOT EXISTS app_name VARCHAR(150);

ALTER TABLE issues ADD COLUMN IF NOT EXISTS approved_by INTEGER;

ALTER TABLE issues ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;


ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_approved_by_fkey;

ALTER TABLE issues ADD CONSTRAINT issues_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(id);


ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_approval_status_check;

ALTER TABLE issues ADD CONSTRAINT issues_approval_status_check CHECK (approval_status IN ('pending', 'approved', 'rejected'));


UPDATE issues SET approval_status = 'approved' WHERE approval_status IS NULL;
