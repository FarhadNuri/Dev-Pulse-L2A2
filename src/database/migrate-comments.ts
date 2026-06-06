import { pool } from "./db";
import fs from "fs";
import path from "path";

const runMigration = async () => {
  try {
    console.log("Running comments migration...");
    const sql = fs.readFileSync(
      path.join(__dirname, "migrate-comments.sql"),
      "utf-8"
    );
    await pool.query(sql);
    console.log("✅ Comments table created successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
};

runMigration();
