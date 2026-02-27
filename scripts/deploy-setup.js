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

    // V1 to V2 Multi-Tenant Migration Check
    const hasLeadsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='leads'").get();
    if (hasLeadsTable) {
        const leadsCols = db.prepare("PRAGMA table_info(leads)").all();
        if (!leadsCols.some(c => c.name === 'user_id')) {
            console.log("⚠️ V1 Database detected. Migrating to V2 Multi-Tenant architecture...");
            // Get first user if available to safely assign legacy data
            let defaultUserId = 'legacy_admin';
            if (hasUsersTable) {
                const firstUser = db.prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1").get();
                if (firstUser) defaultUserId = firstUser.id;
            }
            console.log(`Assigning legacy data to User ID: ${defaultUserId}`);

            const tablesToMigrate = ['leads', 'custom_pitch', 'campaign_config', 'analytics_events'];
            for (const table of tablesToMigrate) {
                const hasTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`).get();
                if (hasTable) {
                    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
                    if (!cols.some(c => c.name === 'user_id')) {
                        console.log(`-> Migrating table: ${table}...`);
                        db.prepare(`ALTER TABLE ${table} ADD COLUMN user_id TEXT DEFAULT '${defaultUserId}'`).run();
                    }
                }
            }
            console.log("✅ V1 -> V2 Migration complete.");
        }
    }

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
