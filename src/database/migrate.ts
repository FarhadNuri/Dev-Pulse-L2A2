import { pool } from "./db";
import fs from "fs";
import path from "path";

const runMigration = async () => {
  try {
    console.log("Running migration for client role and approval workflow...");
    
    const migrationPath = path.join(__dirname, "migration-client-approval.sql");
    const migration = fs.readFileSync(migrationPath, "utf-8");

    // Split by semicolon and execute each statement
    const statements = migration
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--") && !s.toLowerCase().startsWith('select'));

    for (const statement of statements) {
      try {
        console.log(`\n→ Attempting: ${statement.substring(0, 80)}...`);
        await pool.query(statement);
        console.log(`✓ Executed: ${statement.substring(0, 60)}...`);
      } catch (error: any) {
        // Ignore "already exists" errors
        if (
          error.code === '42701' || // duplicate column
          error.code === '42P07' || // duplicate table
          error.code === '42710' || // duplicate object
          error.message.includes('already exists')
        ) {
          console.log(`⊘ Skipped: ${statement.substring(0, 60)}... (already exists)`);
          continue;
        }
        console.log(`\n❌ Failed statement: ${statement}`);
        throw error;
      }
    }
    
    console.log("\n✅ Migration completed successfully!");
    console.log("✅ New features added:");
    console.log("   - Client role added to users table");
    console.log("   - approval_status, app_name, approved_by, approved_at columns added to issues table");
    console.log("   - All existing issues set to 'approved' status");
    
    // Show current state
    try {
      const issueStats = await pool.query(
        "SELECT COUNT(*) as total_issues, approval_status FROM issues GROUP BY approval_status"
      );
      console.log("\n📊 Issue approval status:");
      issueStats.rows.forEach(row => {
        console.log(`   - ${row.approval_status}: ${row.total_issues}`);
      });
    } catch (e) {
      console.log("\n📊 Issue approval status: Unable to query (table might be empty)");
    }

    try {
      const userStats = await pool.query(
        "SELECT COUNT(*) as total_users, role FROM users GROUP BY role"
      );
      console.log("\n👥 User roles:");
      userStats.rows.forEach(row => {
        console.log(`   - ${row.role}: ${row.total_users}`);
      });
    } catch (e) {
      console.log("\n👥 User roles: Unable to query (table might be empty)");
    }
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
};

runMigration();
