ALTER TABLE issues ADD COLUMN project_id INTEGER REFERENCES projects(id);
