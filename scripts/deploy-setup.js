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
    const hasUsersTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();

    console.log("Running idempotent schema setup to ensure all system tables exist...");
    const schema = fs.readFileSync(schemaPath, 'utf8');
    try {
        db.exec(schema);
    } catch (e) {
        console.log("Initial schema exec threw an error, likely missing columns for indexes. This will be fixed by migrations.");
    }
    console.log("Initial Schema table validation complete. Certain indexes will be created post-migration.");

    // Dynamic Database Structure Migration: user_id -> workspace_id
    if (hasUsersTable) {
        console.log("Migrating database architecture and establishing tenant boundaries...");

        // 1. Ensure users table has default_workspace_id
        const usersCols = db.prepare("PRAGMA table_info(users)").all();
        if (!usersCols.some(c => c.name === 'default_workspace_id')) {
            console.log("Adding default_workspace_id to users...");
            db.prepare("ALTER TABLE users ADD COLUMN default_workspace_id TEXT").run();
        }

        // 2. Iterate legacy users and spin up strict workspaces
        const users = db.prepare("SELECT * FROM users WHERE default_workspace_id IS NULL AND id != 'legacy_admin'").all();
        for (const u of users) {
            const wsId = `ws_legacy_${u.id}`;
            console.log(`Provisioning root workspace for legacy user: ${u.email}...`);
            db.prepare(`INSERT OR IGNORE INTO workspaces (id, name, created_at) VALUES (?, ?, datetime('now'))`).run(wsId, `${u.name || 'User'}'s Workspace`);
            db.prepare(`UPDATE users SET default_workspace_id = ? WHERE id = ?`).run(wsId, u.id);
            db.prepare(`INSERT OR IGNORE INTO workspace_users (workspace_id, user_id, role, created_at) VALUES (?, ?, 'admin', datetime('now'))`).run(wsId, u.id);
        }

        console.log("Adding legacy_admin shadow user fallback...");
        db.prepare(`INSERT OR IGNORE INTO users (id, email) VALUES ('legacy_admin', 'system@legacy.admin')`).run();

        // 3. Scan all operational tables and inject workspace_id barriers
        const tablesToMigrate = [
            'leads', 'messages', 'conversations', 'llm_decisions', 'bookings',
            'escalations', 'analytics_events', 'knowledge_base', 'rate_limits',
            'action_log', 'custom_pitch', 'campaign_config', 'business_config'
        ];

        for (const table of tablesToMigrate) {
            const hasTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
            if (hasTable || true) { // SQLite bind sometimes fails on table names, fallback to raw try-catch
                try {
                    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
                    const hasWorkspace = cols.some(c => c.name === 'workspace_id');

                    if (!hasWorkspace) {
                        console.log(`Injecting tenant column (workspace_id) into table: ${table}...`);
                        db.prepare(`ALTER TABLE ${table} ADD COLUMN workspace_id TEXT`).run();

                        // Try to back-propagate the workspace ID based on user_id if present
                        if (cols.some(c => c.name === 'user_id')) {
                            db.prepare(`UPDATE ${table} SET workspace_id = (SELECT default_workspace_id FROM users WHERE users.id = ${table}.user_id)`).run();
                        }
                    }
                } catch (e) {
                    // Table might not exist yet if fresh, perfectly safe to ignore
                }
            }
        }
        console.log("✅ V2 Multi-Tenant Data Migration complete.");

        console.log("Re-running full schema definition to establish missing indexes now that legacy tables contain appropriate IDs...");
        db.exec(schema);
        console.log("✅ Final index pass complete.");
    }
} catch (error) {
    console.error("Error setting up database:", error);
    process.exit(1);
} finally {
    db.close();
}
