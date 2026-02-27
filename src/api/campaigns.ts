import { Router, Request, Response } from 'express';
import campaignRunner from '../orchestrator/campaign-runner';

const router = Router();

/**
 * POST /api/campaigns/start
 * Start a new outbound campaign
 */
router.post('/start', async (req: any, res: Response) => {
    try {
        const userId = req.user?.id;
        const { niche, dailyLimit } = req.body;

        if (!niche) {
            return res.status(400).json({ error: 'Niche is required' });
        }

        const limit = parseInt(dailyLimit) || 50;

        await campaignRunner.start(userId, niche, limit);

        res.json({
            success: true,
            message: `Campaign started for "${niche}"`,
            stats: await campaignRunner.getStats(userId)
        });
    } catch (error) {
        console.error('Failed to start campaign:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/campaigns/stop
 * Stop the current campaign
 */
router.post('/stop', async (req: any, res: Response) => {
    const userId = req.user?.id;
    await campaignRunner.stop(userId);
    res.json({
        success: true,
        message: 'Campaign stopped',
        stats: await campaignRunner.getStats(userId)
    });
});

/**
 * GET /api/campaigns/stats
 * Get current campaign statistics
 */
router.get('/stats', async (req: any, res: Response) => {
    const userId = req.user?.id;
    res.json(await campaignRunner.getStats(userId));
});

export default router;
