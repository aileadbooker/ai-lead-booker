import { Router, Request, Response } from 'express';
import { analyticsTracker } from '../analytics/tracker';

const router = Router();

/**
 * GET /api/analytics
 * Returns analytics summary and conversion funnel
 */
router.get('/analytics', async (req: any, res: Response) => {
    try {
        const workspaceId = (req as any).workspaceId;
        const { period = 'month' } = req.query;

        // Calculate date range based on period
        let days = 30;
        if (period === 'today') days = 1;
        else if (period === 'week') days = 7;
        else if (period === 'month') days = 30;
        else if (period === 'all') days = 36500; // 100 years
        let startDate: Date;

        if (period === 'today') {
            // Start of Today (00:00:00)
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            startDate = d;
        } else if (period === 'all') {
            // All time (Epoch)
            startDate = new Date(0);
        } else {
            // Rolling window for other periods
            const d = new Date();
            d.setDate(d.getDate() - days);
            startDate = d;
        }

        const [summary, funnel, timeline, topLeads] = await Promise.all([
            analyticsTracker.getSummary(workspaceId, startDate.toISOString()),
            analyticsTracker.getConversionFunnel(workspaceId, startDate.toISOString()),
            analyticsTracker.getActivityTimeline(workspaceId, days),
            analyticsTracker.getTopLeads(workspaceId, 10),
        ]);

        res.json({
            summary,
            funnel,
            timeline,
            topLeads,
        });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

/**
 * GET /api/summary
 * Returns daily summary statistics
 */
router.get('/summary', async (req: any, res: Response) => {
    try {
        const workspaceId = (req as any).workspaceId;
        const { period = 'today' } = req.query;

        // Calculate date range
        let days = 1;
        if (period === 'week') days = 7;
        else if (period === 'month') days = 30;

        let startDate: Date;

        if (period === 'today') {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            startDate = d;
        } else {
            const d = new Date();
            d.setDate(d.getDate() - days);
            startDate = d;
        }

        const summary = await analyticsTracker.getSummary(workspaceId, startDate.toISOString());
        const timeline = await analyticsTracker.getActivityTimeline(workspaceId, days);

        // Get hot leads (those who said Y recently)
        const hotLeads = await analyticsTracker.getTopLeads(workspaceId, 5);

        res.json({
            period,
            summary,
            timeline,
            hotLeads,
        });
    } catch (error) {
        console.error('Error fetching summary:', error);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

export default router;
