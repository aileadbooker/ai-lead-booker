import { Router, Request, Response } from 'express';
import { config } from '../config';

const router = Router();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

/**
 * POST /api/login
 * Verify password and create session
 */
router.post('/login', (req: Request, res: Response) => {
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: 'Password required' });
    }

    if (password === ADMIN_PASSWORD) {
        // Create session
        if (req.session) {
            req.session.authenticated = true;
            req.session.user = 'admin';

            // Wait for session save before responding
            req.session.save((err) => {
                if (err) {
                    return res.status(500).json({ error: 'Session error' });
                }
                res.json({ success: true });
            });
        }
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

/**
 * POST /api/logout
 * Destroy session
 */
router.post('/logout', (req: Request, res: Response) => {
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                return res.status(500).json({ error: 'Logout failed' });
            }
            res.clearCookie('connect.sid'); // Default cookie name
            res.json({ success: true });
        });
    } else {
        res.json({ success: true });
    }
});

/**
 * GET /api/me
 * Check session status
 */
router.get('/me', (req: Request, res: Response) => {
    // Check Passport (Google)
    if (req.isAuthenticated && req.isAuthenticated()) {
        return res.json({ authenticated: true, user: req.user });
    }

    // Check Legacy (Admin)
    if (req.session && req.session.authenticated) {
        return res.json({ authenticated: true, user: req.session.user });
    }

    res.status(401).json({ authenticated: false });
});

/**
 * GET /api/dev-login
 * Developer bypass route for local testing (Skips Google Auth wall)
 */
router.get('/dev-login', async (req: any, res: Response, next) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Forbidden in production' });
    }

    try {
        const db = require('../config/database').default;
        const result = await db.query('SELECT * FROM users LIMIT 1');

        let user = result.rows[0];

        if (!user) {
            const devId = `dev_${Date.now()}`;
            const wsId = `ws_dev_${Date.now()}`;
            const devEmail = 'dev.tester@example.com';

            await db.query(`INSERT INTO workspaces (id, name, created_at) VALUES ($1, $2, datetime('now'))`, [wsId, `Dev Workspace`]);

            await db.query(
                `INSERT INTO users (id, default_workspace_id, email, name, has_paid, onboarding_completed, created_at, updated_at) 
                 VALUES ($1, $2, $3, 'Developer Tester', 1, 1, datetime('now'), datetime('now'))`,
                [devId, wsId, devEmail]
            );

            await db.query(`INSERT INTO workspace_users (workspace_id, user_id, role, created_at) VALUES ($1, $2, 'admin', datetime('now'))`, [wsId, devId]);

            const refetch = await db.query('SELECT * FROM users WHERE id = $1', [devId]);
            user = refetch.rows[0];
        }

        req.login(user, (err: any) => {
            if (err) return next(err);
            console.log(`✅ [DEV BACKDOOR] Successfully bypassed OAuth. Logged in as: ${user.email}`);
            return res.redirect('/dashboard');
        });
    } catch (error) {
        console.error('Local bypass failed:', error);
        res.status(500).send('Local login bypass failed.');
    }
});

export default router;
