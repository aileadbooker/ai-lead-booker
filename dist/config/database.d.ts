/**
 * SQLite database connection singleton using better-sqlite3
 */
declare class DatabaseService {
    private static instance;
    private db;
    private constructor();
    static getInstance(): DatabaseService;
    /**
     * Execute a query (select)
     */
    query(text: string, params?: any[]): Promise<{
        rows: any[];
        rowCount: number;
        lastInsertRowid?: number | bigint;
    }>;
    /**
   * For transactions, better-sqlite3 uses built-in .transaction()
   */
    transaction(fn: any): any;
    /**
     * Close connection
     */
    close(): Promise<void>;
    /**
     * Test connection
     */
    testConnection(): Promise<boolean>;
}
export declare const db: DatabaseService;
export default db;
//# sourceMappingURL=database.d.ts.map