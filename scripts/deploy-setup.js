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
    // Check if the users table exists. If it doesn't, the DB is empty.
    const hasUsersTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();

    if (!hasUsersTable) {
        console.log("Database is empty. Running initial schema setup...");
        const schema = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schema);
        console.log("Schema setup complete.");

        // Add default admin if setup was run
        const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
        db.prepare(`
            INSERT OR IGNORE INTO admin_users (username, password) 
            VALUES ('admin', ?)
        `).run(adminPass);
        console.log("Default admin account ensured.");

    } else {
        console.log("Database already initialized. Skipping setup.");
    }
} catch (error) {
    console.error("Error setting up database:", error);
    process.exit(1);
} finally {
    db.close();
}
