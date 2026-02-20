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

export default router;
