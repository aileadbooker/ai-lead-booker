const fs = require('fs');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DATABASE_URL || 'database.sqlite';
const schemaPath = path.join(__dirname, '../database/schema.sql');

console.log(`Checking database at: ${dbPath}`);

// Ensure directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir) && dbDir !== '.') {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

try {
    // Check if essential tables exist (only used for migration logic later)
    const hasUsersTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();

    console.log("Running idempotent schema setup to ensure all system tables exist...");
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);
    console.log("Schema table validation complete.");

    // Migration Check: Ensure users table has google_app_password
    console.log("Running column migration checks...");
    if (hasUsersTable) {
        const usersCols = db.prepare("PRAGMA table_info(users)").all();
        const hasAppPassword = usersCols.some(c => c.name === 'google_app_password');
        if (!hasAppPassword) {
            console.log("Adding google_app_password column to users table...");
            db.prepare("ALTER TABLE users ADD COLUMN google_app_password TEXT").run();
            console.log("Migration complete.");
        }
    }
} catch (error) {
    console.error("Error setting up database:", error);
    process.exit(1);
} finally {
    db.close();
}
