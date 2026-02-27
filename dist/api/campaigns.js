"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const campaign_runner_1 = __importDefault(require("../orchestrator/campaign-runner"));
const router = (0, express_1.Router)();
/**
 * POST /api/campaigns/start
 * Start a new outbound campaign
 */
router.post('/start', async (req, res) => {
    try {
        const userId = req.user?.id;
        const { niche, dailyLimit } = req.body;
        if (!niche) {
            return res.status(400).json({ error: 'Niche is required' });
        }
        const limit = parseInt(dailyLimit) || 50;
        await campaign_runner_1.default.start(userId, niche, limit);
        res.json({
            success: true,
            message: `Campaign started for "${niche}"`,
            stats: await campaign_runner_1.default.getStats(userId)
        });
    }
    catch (error) {
        console.error('Failed to start campaign:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * POST /api/campaigns/stop
 * Stop the current campaign
 */
router.post('/stop', async (req, res) => {
    const userId = req.user?.id;
    await campaign_runner_1.default.stop(userId);
    res.json({
        success: true,
        message: 'Campaign stopped',
        stats: await campaign_runner_1.default.getStats(userId)
    });
});
/**
 * GET /api/campaigns/stats
 * Get current campaign statistics
 */
router.get('/stats', async (req, res) => {
    const userId = req.user?.id;
    res.json(await campaign_runner_1.default.getStats(userId));
});
exports.default = router;
//# sourceMappingURL=campaigns.js.map