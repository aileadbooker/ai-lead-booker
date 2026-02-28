import { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import { config } from '../config';
import db from '../config/database';

// Extend Session Data
declare module 'express-session' {
    interface SessionData {
        authenticated: boolean;
        user: string;
    }
}

/**
 * Session Configuration
 */
export const sessionConfig = session({
    secret: config.sessionSecret || 'fallback_secret_key_change_in_prod',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // true in prod
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
});

/**
 * Middleware to protect routes
 */
export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    // Passport adds isAuthenticated() to req
    if (req.isAuthenticated && req.isAuthenticated()) {
        const user = req.user as any;

        // 1. Check Payment
        const freeAccessEmails = ['Kevin.johnson.jr723@gmail.com', 'ai.leadbooker@gmail.com'];
        const isFreeAccessUser = user && user.email && freeAccessEmails.includes(user.email);

        if (!user.has_paid && !isFreeAccessUser) {
            // Allow API requests to succeed for the payment endpoint itself
            if (req.path === '/api/checkout/success' || req.originalUrl.includes('/create-checkout-session')) return next();
            // Also allow webhooks (handled below but good safety)
            if (req.originalUrl.includes('/webhooks')) return next();

            if (req.originalUrl.startsWith('/api/')) {
                return res.status(403).json({ error: 'Payment required' });
            }
            return res.redirect('/checkout');
        }

        // 2. Check Onboarding
        if (!user.onboarding_completed) {
            // Allow API requests for onboarding completion
            if (req.path === '/api/onboarding/complete') return next();

            if (req.originalUrl.startsWith('/api/')) {
                return res.status(403).json({ error: 'Onboarding required' });
            }
            return res.redirect('/onboarding');
        }

        return next();
    }

    // Legacy session check (fallback)
    if (req.session && req.session.authenticated) {
        return next(); // Legacy users assumed verified for now
    }

    // API request: 401 Unauthorized
    if (req.originalUrl.startsWith('/api/') && !req.originalUrl.startsWith('/api/auth') && !req.originalUrl.includes('/webhooks')) {
        console.log('401 Unauthorized:', req.originalUrl, 'Session:', req.sessionID, 'Auth:', req.isAuthenticated ? req.isAuthenticated() : 'N/A');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Page request: Redirect to landing
    return res.redirect('/');
};

/**
 * Middleware to ensure request is scoped to a valid workspace
 */
export const requireWorkspace = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = req.user as any;

    // Check if the request specifies a workspace in headers (for multi-workspace) or fallback to default
    const requestedWorkspaceId = req.headers['x-workspace-id'] || user.default_workspace_id;

    if (!requestedWorkspaceId) {
        return res.status(403).json({ error: 'No workspace assigned' });
    }

    try {
        // Validate user has access to this workspace
        const link = await db.query('SELECT role FROM workspace_users WHERE workspace_id = $1 AND user_id = $2', [requestedWorkspaceId, user.id]);
        if (link.rows.length === 0) {
            return res.status(403).json({ error: 'Access denied to this workspace' });
        }

        (req as any).workspaceId = requestedWorkspaceId;
        (req as any).workspaceRole = link.rows[0].role;
        next();
    } catch (err) {
        console.error('requireWorkspace error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
