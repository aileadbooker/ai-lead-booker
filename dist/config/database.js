"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
/**
 * SQLite database connection singleton using better-sqlite3
 */
class DatabaseService {
    constructor() {
        const dbPath = process.env.DATABASE_URL || 'database.sqlite';
        // Ensure the directory exists
        const dbDir = path_1.default.dirname(dbPath);
        if (!fs_1.default.existsSync(dbDir) && dbDir !== '.') {
            fs_1.default.mkdirSync(dbDir, { recursive: true });
        }
        console.log(`Initializing SQLite database at: ${dbPath}`);
        this.db = new better_sqlite3_1.default(dbPath, {
            verbose: console.log,
        });
        // Enable WAL mode for better concurrency
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
    }
    static getInstance() {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }
    /**
     * Execute a query (select)
     */
    async query(text, params = []) {
        const start = Date.now();
        try {
            // Convert $1, $2 style params to ? for SQLite if needed, 
            // but better-sqlite3 supports named params or ? better.
            // For MVP simplicity and keeping Postgres-like query style, we'll do a simple transform.
            const sqliteText = text.replace(/\$(\d+)/g, '?');
            let res;
            if (text.trim().toUpperCase().startsWith('SELECT')) {
                const stmt = this.db.prepare(sqliteText);
                const rows = stmt.all(params);
                res = { rows, rowCount: rows.length };
            }
            else {
                const stmt = this.db.prepare(sqliteText);
                const info = stmt.run(params);
                res = { rows: [], rowCount: info.changes, lastInsertRowid: info.lastInsertRowid };
            }
            const duration = Date.now() - start;
            console.log('Executed query', { duration, rows: res.rowCount });
            return res;
        }
        catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
    }
    /**
   * For transactions, better-sqlite3 uses built-in .transaction()
   */
    transaction(fn) {
        return this.db.transaction(fn);
    }
    /**
     * Close connection
     */
    async close() {
        this.db.close();
    }
    /**
     * Test connection
     */
    async testConnection() {
        try {
            this.db.prepare("SELECT datetime('now')").get();
            console.log('SQLite database connection successful');
            return true;
        }
        catch (error) {
            console.error('SQLite database connection failed:', error);
            return false;
        }
    }
}
exports.db = DatabaseService.getInstance();
exports.default = exports.db;
//# sourceMappingURL=database.js.map