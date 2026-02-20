import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

/**
 * SQLite database connection singleton using better-sqlite3
 */
class DatabaseService {
    private static instance: DatabaseService;
    private db: Database.Database;

    private constructor() {
        const dbPath = process.env.DATABASE_URL || 'database.sqlite';

        // Ensure the directory exists
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir) && dbDir !== '.') {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        console.log(`Initializing SQLite database at: ${dbPath}`);

        this.db = new Database(dbPath, {
            verbose: console.log,
        });

        // Enable WAL mode for better concurrency
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
    }

    public static getInstance(): DatabaseService {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }

    /**
     * Execute a query (select)
     */
    public async query(text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number; lastInsertRowid?: number | bigint }> {
        const start = Date.now();
        try {
            // Convert $1, $2 style params to ? for SQLite if needed, 
            // but better-sqlite3 supports named params or ? better.
            // For MVP simplicity and keeping Postgres-like query style, we'll do a simple transform.
            const sqliteText = text.replace(/\$(\d+)/g, '?');

            let res;
            if (text.trim().toUpperCase().startsWith('SELECT')) {
                const stmt = this.db.prepare(sqliteText);
                const rows = stmt.all(params) as any[];
                res = { rows, rowCount: rows.length };
            } else {
                const stmt = this.db.prepare(sqliteText);
                const info = stmt.run(params);
                res = { rows: [] as any[], rowCount: info.changes, lastInsertRowid: info.lastInsertRowid };
            }

            const duration = Date.now() - start;
            console.log('Executed query', { duration, rows: res.rowCount });
            return res;
        } catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
    }

    /**
   * For transactions, better-sqlite3 uses built-in .transaction()
   */
    public transaction(fn: any): any {
        return this.db.transaction(fn);
    }

    /**
     * Close connection
     */
    public async close(): Promise<void> {
        this.db.close();
    }

    /**
     * Test connection
     */
    public async testConnection(): Promise<boolean> {
        try {
            this.db.prepare("SELECT datetime('now')").get();
            console.log('SQLite database connection successful');
            return true;
        } catch (error) {
            console.error('SQLite database connection failed:', error);
            return false;
        }
    }
}

export const db = DatabaseService.getInstance();
export default db;
