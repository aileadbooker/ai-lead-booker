import express from 'express';
import path from 'path';
import dns from 'dns';

// Force Node.js to prioritize IPv4 globally (Bypasses IPv6 ENETUNREACH on Railway)
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}
import { config, validateConfig } from './config';
import db from './config/database';
import emailService from './ingestion/email-service';
import leadProcessor from './orchestrator/lead-processor';
import followupScheduler from './orchestrator/scheduler';
import dailyReporter from './orchestrator/daily-reporter';
import campaignRunner from './orchestrator/campaign-runner';
import queueWorker from './orchestrator/queue-worker';
import reconciliationJob from './orchestrator/reconciliation-job';
import analyticsRoutes from './api/analytics';
import pitchRoutes from './api/pitch';
import authRoutes from './api/auth';
import campaignRoutes from './api/campaigns';
import leadsRoutes from './api/leads';
import checkoutRoutes from './api/checkout';
import settingsRouter from './api/settings';
import { sessionConfig, isAuthenticated, requireWorkspace } from './middleware/auth';

// ...

// Start Daily Reporter
dailyReporter.start();

class EmailMonitor {
    private intervalId: NodeJS.Timeout | null = null;
    private isPolling: boolean = false;

    /**
     * Start monitoring email inbox
     */
    start(intervalMs: number = 60000): void {
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
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('Email monitor stopped');
        }
    }

    /**
     * Poll inbox and process new leads
     */
    private async poll(): Promise<void> {
        if (this.isPolling) return; // Prevent overlapping polls
        this.isPolling = true;

        try {
            console.log('\n--- Polling inbox ---');

            const newLeads = await emailService.pollAllInboxes();

            if (newLeads.length === 0) {
                console.log('No new leads');
            } else {
                console.log(`Processing ${newLeads.length} new lead(s)...`);

                // Process each lead
                for (const lead of newLeads) {
                    await leadProcessor.processLead(lead);
                }
            }

            console.log('--- Polling complete ---\n');
        } catch (error) {
            console.error('Error in email monitor poll:', error);
        } finally {
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
    const validation = validateConfig();
    if (!validation.valid) {
        console.error('❌ Configuration validation failed');
        process.exit(1);
    }

    // 2. Test database connection
    const dbConnected = await db.testConnection();
    if (!dbConnected) {
        console.error('❌ Database connection failed');
        process.exit(1);
    }

    // 3. Start Express server (for webhooks and future API)
    const app = express();
    app.set('trust proxy', 1); // Trust first proxy (required for Railway + secure cookies)
    app.use(express.json());

    app.get('/health', (req, res) => {
        res.json({ status: 'healthy', timestamp: new Date() });
    });

    // Explicit route for Google Site Verification
    app.get('/googlec007ebb8e49ac379.html', (req, res) => {
        res.sendFile(path.join(__dirname, '../public/googlec007ebb8e49ac379.html'));
    });

    // Serve static frontend
    app.use(express.static(path.join(__dirname, '../public')));

    // Session Configuration
    app.use(sessionConfig);

    // Passport Init
    const passport = require('./auth/passport').default;
    app.use(passport.initialize());
    app.use(passport.session());

    // Public Routes
    app.get('/', (req, res) => {
        if (req.isAuthenticated()) {
            return res.redirect('/dashboard');
        }
        res.sendFile(path.join(__dirname, '../public/landing.html'));
    });

    app.get('/dashboard', isAuthenticated, (req, res) => {
        res.sendFile(path.join(__dirname, '../public/dashboard.html'));
    });

    // Auth Routes
    app.use('/api', authRoutes);

    app.get('/auth/google', passport.authenticate('google', {
        scope: ['profile', 'email', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
        accessType: 'offline',
        prompt: 'consent'
    }));

    app.get('/auth/google/callback',
        passport.authenticate('google', { failureRedirect: '/' }),
        (req, res) => {
            console.log('Google Auth Success, User:', req.user);
            res.redirect('/dashboard'); // Middleware will handle redirection based on status
        }
    );

    // Helper to check free access whitelist
    const isFreeAccess = (user: any) => {
        const freeAccessEmails = ['Kevin.johnson.jr723@gmail.com', 'ai.leadbooker@gmail.com'];
        return user && user.email && freeAccessEmails.includes(user.email);
    };

    // Onboarding & Payment Routes
    app.get('/checkout', (req, res) => {
        const user = req.user as any;
        if (req.isAuthenticated() && (user?.has_paid || isFreeAccess(user))) {
            return res.redirect('/dashboard');
        }
        res.sendFile(path.join(__dirname, '../public/checkout.html'));
    });

    app.get('/onboarding', (req, res) => {
        if (!req.isAuthenticated()) return res.redirect('/');
        const user = req.user as any;

        // Allow access if returning from Stripe checkout
        if (!user.has_paid && !isFreeAccess(user) && !req.query.session_id) {
            return res.redirect('/checkout');
        }

        if (user.onboarding_completed) return res.redirect('/dashboard');

        res.sendFile(path.join(__dirname, '../public/onboarding.html'));
    });

    // API: Mock Payment Success
    app.post('/api/checkout/success', async (req, res) => {
        if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });

        const userId = (req.user as any).id;
        try {
            await db.query('UPDATE users SET has_paid = 1 WHERE id = $1', [userId]);

            // Update session user to reflect change immediately
            (req.user as any).has_paid = 1;

            res.json({ success: true });
        } catch (error) {
            console.error('Payment update failed:', error);
            res.status(500).json({ error: 'Database error' });
        }
    });

    // API: Onboarding Complete
    app.post('/api/onboarding/complete', async (req, res) => {
        if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });

        const userId = (req.user as any).id;
        try {
            await db.query('UPDATE users SET onboarding_completed = 1 WHERE id = $1', [userId]);

            // Update session user
            (req.user as any).onboarding_completed = 1;

            res.json({ success: true });
        } catch (error) {
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
    app.use('/api', isAuthenticated, requireWorkspace);

    // Campaign Routes
    app.use('/api/campaigns', campaignRoutes);

    // Manual Trigger for Daily Summary (Protected)
    app.post('/api/admin/trigger-summary', async (req, res) => {
        try {
            await dailyReporter.triggerNow();
            res.json({ success: true, message: 'Daily summary triggered' });
        } catch (error) {
            console.error('Failed to trigger summary:', error);
            res.status(500).json({ error: 'Failed to trigger summary' });
        }
    });

    // Analytics & Summary API routes (Protected)
    app.use('/api', analyticsRoutes);
    app.use('/api', pitchRoutes);
    app.use('/api/leads', leadsRoutes);
    app.use('/api', checkoutRoutes);
    app.use('/api/settings', settingsRouter);



    // API: Get settings
    app.get('/api/settings', async (req, res) => {
        try {
            const workspaceId = (req as any).workspaceId;
            const result = await db.query('SELECT * FROM business_config WHERE workspace_id = $1 LIMIT 1', [workspaceId]);
            res.json(result.rows[0] || {});
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });

    app.listen(config.port, () => {
        console.log(`✅ Server listening on port ${config.port}`);
    });

    // 4. Start email monitoring
    const emailMonitor = new EmailMonitor();
    emailMonitor.start(60000); // Poll every 60 seconds

    // Initialize campaign runner & queue worker
    await campaignRunner.init();
    queueWorker.start(5000); // 5 second polling interval

    // 5. Start follow-up scheduler
    followupScheduler.start(60000); // Check for follow-ups every 60 seconds

    // 6. Start nightly reconciliation
    reconciliationJob.start();

    // 6. Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('\nSIGTERM received, shutting down gracefully...');
        emailMonitor.stop();
        followupScheduler.stop();
        queueWorker.stop();
        reconciliationJob.stop();
        await db.close();
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        console.log('\nSIGINT received, shutting down gracefully...');
        emailMonitor.stop();
        followupScheduler.stop();
        queueWorker.stop();
        reconciliationJob.stop();
        await db.close();
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

export default main;
