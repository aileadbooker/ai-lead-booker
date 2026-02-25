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
    // Check if essential tables exist.
    const hasLeadsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='leads'").get();
    const hasUsersTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();

    if (!hasLeadsTable || !hasUsersTable) {
        console.log("Database is missing tables. Running schema setup (idempotent)...");
        const schema = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schema);
        console.log("Schema setup complete.");
    } else {
        console.log("Database already initialized. Skipping setup.");
    }

    // Migration Check: Ensure users table has google_app_password
    console.log("Running migration checks...");
    if (hasUsersTable) {
        const usersCols = db.prepare("PRAGMA table_info(users)").all();
        const hasAppPassword = usersCols.some(c => c.name === 'google_app_password');
        if (!hasAppPassword) {
            console.log("Adding google_app_password column to users table...");
            db.prepare("ALTER TABLE users ADD COLUMN google_app_password TEXT").run();
            console.log("Migration complete.");
        }
    }

    // Migration Check: Ensure custom_pitch table exists
    const hasCustomPitchTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='custom_pitch'").get();
    if (!hasCustomPitchTable) {
        console.log("Adding custom_pitch table...");
        db.exec(`
            CREATE TABLE IF NOT EXISTS custom_pitch (
              id TEXT PRIMARY KEY,
              initial_pitch TEXT NOT NULL,
              yes_response TEXT NOT NULL,
              no_response TEXT NOT NULL,
              yes_2_response TEXT,
              no_2_response TEXT,
              created_at TEXT DEFAULT (datetime('now')),
              updated_at TEXT DEFAULT (datetime('now'))
            );
        `);
        console.log("custom_pitch table created.");
    }

    // Migration Check: Ensure campaign_config table exists
    const hasCampaignConfigTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='campaign_config'").get();
    if (!hasCampaignConfigTable) {
        console.log("Adding campaign_config table...");
        db.exec(`
            CREATE TABLE IF NOT EXISTS campaign_config (
              id TEXT PRIMARY KEY,
              status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running')),
              current_niche TEXT,
              daily_limit INTEGER DEFAULT 50,
              updated_at TEXT DEFAULT (datetime('now'))
            );
        `);
        console.log("campaign_config table created.");
    }
} catch (error) {
    console.error("Error setting up database:", error);
    process.exit(1);
} finally {
    db.close();
}
