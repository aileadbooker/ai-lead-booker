"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const database_1 = __importDefault(require("./config/database"));
const email_service_1 = __importDefault(require("./ingestion/email-service"));
const lead_processor_1 = __importDefault(require("./orchestrator/lead-processor"));
const scheduler_1 = __importDefault(require("./orchestrator/scheduler"));
const daily_reporter_1 = __importDefault(require("./orchestrator/daily-reporter"));
const campaign_runner_1 = __importDefault(require("./orchestrator/campaign-runner"));
const analytics_1 = __importDefault(require("./api/analytics"));
const pitch_1 = __importDefault(require("./api/pitch"));
const auth_1 = __importDefault(require("./api/auth"));
const campaigns_1 = __importDefault(require("./api/campaigns"));
const leads_1 = __importDefault(require("./api/leads"));
const checkout_1 = __importDefault(require("./api/checkout"));
const settings_1 = __importDefault(require("./api/settings"));
const auth_2 = require("./middleware/auth");
// ...
// Start Daily Reporter
daily_reporter_1.default.start();
class EmailMonitor {
    constructor() {
        this.intervalId = null;
        this.isPolling = false;
    }
    /**
     * Start monitoring email inbox
     */
    start(intervalMs = 60000) {
        console.log(`Starting email monitor (polling every ${intervalMs / 1000}s)...`);
        // Initial poll
        this.poll();
        // Set up recurring poll
        this.intervalId = setInterval(() => {
            this.poll();
        }, intervalMs);
    }
    /**
     * Stop monitoring
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('Email monitor stopped');
        }
    }
    /**
     * Poll inbox and process new leads
     */
    async poll() {
        if (this.isPolling)
            return; // Prevent overlapping polls
        this.isPolling = true;
        try {
            console.log('\n--- Polling inbox ---');
            const newLeads = await email_service_1.default.pollAllInboxes();
            if (newLeads.length === 0) {
                console.log('No new leads');
            }
            else {
                console.log(`Processing ${newLeads.length} new lead(s)...`);
                // Process each lead
                for (const lead of newLeads) {
                    await lead_processor_1.default.processLead(lead);
                }
            }
            console.log('--- Polling complete ---\n');
        }
        catch (error) {
            console.error('Error in email monitor poll:', error);
        }
        finally {
            this.isPolling = false;
        }
    }
}
/**
 * Main application server
 */
async function main() {
    console.log('🚀 AI Lead Booker starting...\n');
    // 1. Validate configuration
    const validation = (0, config_1.validateConfig)();
    if (!validation.valid) {
        console.error('❌ Configuration validation failed');
        process.exit(1);
    }
    // 2. Test database connection
    const dbConnected = await database_1.default.testConnection();
    if (!dbConnected) {
        console.error('❌ Database connection failed');
        process.exit(1);
    }
    // 3. Start Express server (for webhooks and future API)
    const app = (0, express_1.default)();
    app.set('trust proxy', 1); // Trust first proxy (required for Railway + secure cookies)
    app.use(express_1.default.json());
    app.get('/health', (req, res) => {
        res.json({ status: 'healthy', timestamp: new Date() });
    });
    // Explicit route for Google Site Verification
    app.get('/googlec007ebb8e49ac379.html', (req, res) => {
        res.sendFile(path_1.default.join(__dirname, '../public/googlec007ebb8e49ac379.html'));
    });
    // Serve static frontend
    app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
    // Session Configuration
    app.use(auth_2.sessionConfig);
    // Passport Init
    const passport = require('./auth/passport').default;
    app.use(passport.initialize());
    app.use(passport.session());
    // Public Routes
    app.get('/', (req, res) => {
        if (req.isAuthenticated()) {
            return res.redirect('/dashboard');
        }
        res.sendFile(path_1.default.join(__dirname, '../public/landing.html'));
    });
    app.get('/dashboard', auth_2.isAuthenticated, (req, res) => {
        res.sendFile(path_1.default.join(__dirname, '../public/dashboard.html'));
    });
    // Auth Routes
    app.use('/api', auth_1.default);
    app.get('/auth/google', passport.authenticate('google', {
        scope: ['profile', 'email', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
        accessType: 'offline',
        prompt: 'consent'
    }));
    app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => {
        console.log('Google Auth Success, User:', req.user);
        res.redirect('/dashboard'); // Middleware will handle redirection based on status
    });
    // Helper to check free access whitelist
    const isFreeAccess = (user) => {
        const freeAccessEmails = ['Kevin.johnson.jr723@gmail.com', 'ai.leadbooker@gmail.com'];
        return user && user.email && freeAccessEmails.includes(user.email);
    };
    // Onboarding & Payment Routes
    app.get('/checkout', (req, res) => {
        const user = req.user;
        if (req.isAuthenticated() && (user?.has_paid || isFreeAccess(user))) {
            return res.redirect('/dashboard');
        }
        res.sendFile(path_1.default.join(__dirname, '../public/checkout.html'));
    });
    app.get('/onboarding', (req, res) => {
        if (!req.isAuthenticated())
            return res.redirect('/');
        const user = req.user;
        // Allow access if returning from Stripe checkout
        if (!user.has_paid && !isFreeAccess(user) && !req.query.session_id) {
            return res.redirect('/checkout');
        }
        if (user.onboarding_completed)
            return res.redirect('/dashboard');
        res.sendFile(path_1.default.join(__dirname, '../public/onboarding.html'));
    });
    // API: Mock Payment Success
    app.post('/api/checkout/success', async (req, res) => {
        if (!req.isAuthenticated())
            return res.status(401).json({ error: 'Unauthorized' });
        const userId = req.user.id;
        try {
            await database_1.default.query('UPDATE users SET has_paid = 1 WHERE id = $1', [userId]);
            // Update session user to reflect change immediately
            req.user.has_paid = 1;
            res.json({ success: true });
        }
        catch (error) {
            console.error('Payment update failed:', error);
            res.status(500).json({ error: 'Database error' });
        }
    });
    // API: Onboarding Complete
    app.post('/api/onboarding/complete', async (req, res) => {
        if (!req.isAuthenticated())
            return res.status(401).json({ error: 'Unauthorized' });
        const userId = req.user.id;
        try {
            await database_1.default.query('UPDATE users SET onboarding_completed = 1 WHERE id = $1', [userId]);
            // Update session user
            req.user.onboarding_completed = 1;
            res.json({ success: true });
        }
        catch (error) {
            console.error('Onboarding update failed:', error);
            res.status(500).json({ error: 'Database error' });
        }
    });
    app.post('/api/logout', (req, res) => {
        req.logout(() => {
            res.redirect('/');
        });
    });
    // Protect all other API routes
    app.use('/api', auth_2.isAuthenticated);
    // Campaign Routes
    app.use('/api/campaigns', campaigns_1.default);
    // Manual Trigger for Daily Summary (Protected)
    app.post('/api/admin/trigger-summary', async (req, res) => {
        try {
            await daily_reporter_1.default.triggerNow();
            res.json({ success: true, message: 'Daily summary triggered' });
        }
        catch (error) {
            console.error('Failed to trigger summary:', error);
            res.status(500).json({ error: 'Failed to trigger summary' });
        }
    });
    // Analytics & Summary API routes (Protected)
    app.use('/api', analytics_1.default);
    app.use('/api', pitch_1.default);
    app.use('/api/leads', leads_1.default);
    app.use('/api', checkout_1.default);
    app.use('/api/settings', settings_1.default);
    // API: Get settings
    app.get('/api/settings', async (req, res) => {
        try {
            const result = await database_1.default.query('SELECT * FROM business_config LIMIT 1');
            res.json(result.rows[0] || {});
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.listen(config_1.config.port, () => {
        console.log(`✅ Server listening on port ${config_1.config.port}`);
    });
    // 4. Start email monitoring
    const emailMonitor = new EmailMonitor();
    emailMonitor.start(60000); // Poll every 60 seconds
    // Initialize campaign runner (resumes if active in DB)
    await campaign_runner_1.default.init();
    // 5. Start follow-up scheduler
    scheduler_1.default.start(60000); // Check for follow-ups every 60 seconds
    // 6. Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('\nSIGTERM received, shutting down gracefully...');
        emailMonitor.stop();
        scheduler_1.default.stop();
        await database_1.default.close();
        process.exit(0);
    });
    process.on('SIGINT', async () => {
        console.log('\nSIGINT received, shutting down gracefully...');
        emailMonitor.stop();
        scheduler_1.default.stop();
        await database_1.default.close();
        process.exit(0);
    });
    console.log('\n✅ AI Lead Booker is running!');
    console.log('📧 Monitoring inbox for new leads...\n');
}
// Start the application
if (require.main === module) {
    main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
exports.default = main;
//# sourceMappingURL=index.js.map