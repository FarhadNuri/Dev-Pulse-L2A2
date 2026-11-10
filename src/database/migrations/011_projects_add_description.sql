-- Migration: Add description to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;

