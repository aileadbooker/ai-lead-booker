import { Request, Response, NextFunction } from 'express';
declare module 'express-session' {
    interface SessionData {
        authenticated: boolean;
        user: string;
    }
}
/**
 * Session Configuration
 */
export declare const sessionConfig: import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
/**
 * Middleware to protect routes
 */
export declare const isAuthenticated: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
//# sourceMappingURL=auth.d.ts.map