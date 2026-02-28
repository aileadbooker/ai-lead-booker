import { Router } from 'express';
import db from '../config/database';
import { isAuthenticated } from '../middleware/auth';

const router = Router();

router.get('/email-config', isAuthenticated, async (req: any, res) => {
    try {
        const workspaceId = (req as any).workspaceId;

        const result = await db.query('SELECT email FROM oauth_accounts WHERE workspace_id = $1 LIMIT 1', [workspaceId]);
        const hasOAuth = result.rows.length > 0;

        res.json({
            configured: hasOAuth,
            email: hasOAuth ? result.rows[0].email : null
        });
    } catch (error) {
        console.error('Failed to fetch email config:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/settings/email-config (DEPRECATED)
router.post('/email-config', isAuthenticated, async (req: any, res) => {
    res.status(405).json({
        error: 'App Passwords are no longer supported. Please log out and back in with Google to automatically link your account securely.'
    });
});

export default router;
