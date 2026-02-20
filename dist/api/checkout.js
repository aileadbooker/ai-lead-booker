"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const stripe_1 = __importDefault(require("stripe"));
const crypto_1 = __importDefault(require("crypto"));
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
        // Get single tenant config
        const configRes = await database_1.default.query('SELECT stripe_customer_id, business_email FROM business_config LIMIT 1');
        let customerId = configRes.rows[0]?.stripe_customer_id;
        // Check if customer ID is valid for current mode
        const isMockMode = process.env.STRIPE_SECRET_KEY?.includes('test_placeholder');
        const isInvalidId = !customerId || (customerId === 'cus_mock' && !isMockMode);
        if (isInvalidId) {
            console.log('Creating new Stripe Customer due to missing/invalid ID...');
            // Lazy create customer
            const email = configRes.rows[0]?.business_email || 'user@example.com';
            const customer = await stripe.customers.create({ email });
            customerId = customer.id;
            // Save to DB: INSERT or UPDATE
            if (configRes.rowCount === 0) {
                await database_1.default.query(`
                    INSERT INTO business_config (id, business_name, business_email, stripe_customer_id)
                    VALUES ($1, $2, $3, $4)
                `, [crypto_1.default.randomUUID(), 'My Business', email, customerId]);
            }
            else {
                await database_1.default.query('UPDATE business_config SET stripe_customer_id = $1', [customerId]);
            }
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