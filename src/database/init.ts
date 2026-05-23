import { pool } from "./db";
import fs from "fs";
import path from "path";

const initDatabase = async () => {
  try {
    const schemaPath = path.join(__dirname, "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf-8");

    await pool.query(schema);
    
    console.log("Database schema created successfully!");
    console.log("Tables created: users, issues");
    console.log("Triggers created for auto-updating timestamps");
    
    process.exit(0);
  } catch (error) {
    console.error("Database Connection failed:", error);
    process.exit(1);
  }
};

initDatabase();
