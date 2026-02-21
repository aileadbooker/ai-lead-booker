"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const stripe_1 = __importDefault(require("stripe"));
const database_1 = __importDefault(require("../config/database"));
const router = express_1.default.Router();
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
    apiVersion: '2023-10-16', // Cast to any to avoid strict version mismatch with latest SDK
});
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
// POST /api/create-checkout-session
router.post('/create-checkout-session', async (req, res) => {
    try {
        const { plan } = req.body; // 'starter', 'growth'
        // MOCK MODE
        if (process.env.STRIPE_SECRET_KEY?.includes('placeholder')) {
            console.log('⚠️ Using Mock Stripe Session');
            return res.json({
                url: `${BASE_URL}/onboarding?session_id=mock_session_${Date.now()}`
            });
        }
        let amount = 99900;
        let name = 'Starter Plan';
        if (plan === 'growth') {
            amount = 199900;
            name = 'Growth Plan';
        }
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: name,
                        },
                        unit_amount: amount,
                        recurring: {
                            interval: 'month',
                        },
                    },
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${BASE_URL}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${BASE_URL}/checkout`,
        });
        res.json({ url: session.url });
    }
    catch (error) {
        console.error('Stripe error:', error.type, error.message);
        if (error.type === 'StripeAuthenticationError') {
            return res.status(500).json({ error: 'Stripe configuration error: Invalid API Key' });
        }
        res.status(500).json({ error: error.message || 'Payment initialization failed' });
    }
});
// POST /api/create-portal-session
router.post('/create-portal-session', async (req, res) => {
    try {
        // MOCK MODE
        if (process.env.STRIPE_SECRET_KEY?.includes('placeholder')) {
            return res.json({ url: `${BASE_URL}/mock-portal.html` });
        }
        // Mock behavior or lazy create customer if using test key
        let customerId = 'cus_mock';
        const isMockMode = process.env.STRIPE_SECRET_KEY?.includes('test_placeholder') || process.env.STRIPE_SECRET_KEY === 'sk_test_mock';
        if (!isMockMode) {
            console.log('Creating new Stripe Customer due to missing DB support...');
            // Fetch any user to attach the customer to (fallback logic)
            const userRes = await database_1.default.query('SELECT email FROM users LIMIT 1');
            const email = userRes.rows[0]?.email || 'fallback@example.com';
            // In a complete implementation, this would be tied to the specific user's record
            // For now, we generate a fresh customer to allow the portal to open
            const customer = await stripe.customers.create({ email });
            customerId = customer.id;
        }
        console.log('Creating portal session for customer:', customerId);
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${BASE_URL}/billing.html`,
        });
        res.json({ url: session.url });
    }
    catch (error) {
        console.error('Stripe Portal error:', error.type, error.message);
        if (error.type === 'StripeInvalidRequestError') {
            return res.status(400).json({ error: 'Stripe configuration error: Invalid Customer ID' });
        }
        res.status(500).json({ error: error.message || 'Portal initialization failed' });
    }
});
// Webhook
router.post('/webhooks/stripe', express_1.default.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        if (process.env.STRIPE_SECRET_KEY?.includes('placeholder')) {
            // Ignore in mock mode
            return res.send();
        }
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    }
    catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        // Fulfill order, update DB
        console.log('Payment successful for session:', session.id);
        // await db.query('UPDATE users ...');
    }
    res.json({ received: true });
});
exports.default = router;
//# sourceMappingURL=checkout.js.map