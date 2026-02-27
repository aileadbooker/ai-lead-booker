"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const imap_simple_1 = __importDefault(require("imap-simple"));
const mailparser_1 = require("mailparser");
const ics = __importStar(require("ics"));
const uuid_1 = require("uuid");
const config_1 = require("../config");
const database_1 = __importDefault(require("../config/database"));
const tracker_1 = require("../analytics/tracker");
/**
 * Standard Email Service (SMTP/IMAP)
 * Replaces GmailService for production use without Google Cloud
 */
class EmailService {
    constructor() {
        if (!config_1.config.enableRealEmail) {
            console.log('Real email disabled. EmailService will not send/receive.');
            return;
        }
        this.transporter = nodemailer_1.default.createTransport({
            host: config_1.config.smtp.host,
            port: config_1.config.smtp.port,
            secure: config_1.config.smtp.port === 465, // true for 465, false for other ports
            auth: {
                user: config_1.config.smtp.user,
                pass: config_1.config.smtp.pass,
            },
        });
    }
    /**
     * Poll ALL IMAP inboxes for new unread messages
     */
    async pollAllInboxes() {
        if (!config_1.config.enableRealEmail)
            return [];
        let allNewLeads = [];
        try {
            // Get all strictly initialized users
            const users = await database_1.default.query(`SELECT id, email, google_app_password FROM users WHERE google_app_password IS NOT NULL`);
            for (const user of users.rows) {
                try {
                    const leads = await this.pollUserInbox(user.id, user.email, user.google_app_password);
                    allNewLeads.push(...leads);
                }
                catch (err) {
                    console.error(`Error polling inbox for user ${user.id}:`, err);
                }
            }
            return allNewLeads;
        }
        catch (error) {
            console.error('Error in multi-tenant general inbox poller:', error);
            return [];
        }
    }
    /**
     * Poll a specific user's IMAP inbox
     */
    async pollUserInbox(userId, imapUser, imapPass) {
        let connection = null;
        try {
            const imapConfig = {
                imap: {
                    user: imapUser,
                    password: imapPass,
                    host: config_1.config.imap.host,
                    port: config_1.config.imap.port,
                    tls: true,
                    tlsOptions: { rejectUnauthorized: false },
                    authTimeout: 10000,
                },
            };
            console.log('Connecting to IMAP...');
            connection = await imap_simple_1.default.connect(imapConfig);
            await connection.openBox('INBOX');
            // CRITICAL: Only fetch emails from leads WE contacted (those with outbound messages) for THIS user
            const outboundLeads = await database_1.default.query(`
                SELECT DISTINCT l.email 
                FROM leads l
                JOIN messages m ON l.id = m.lead_id
                WHERE m.direction = 'outbound' AND l.user_id = $1
            `, [userId]);
            console.log(`Checking UNSEEN emails from ${outboundLeads.rows.length} leads we contacted...`);
            const newLeads = [];
            // For each lead we contacted, check for UNSEEN replies
            for (const row of outboundLeads.rows) {
                const leadEmail = row.email;
                try {
                    const searchCriteria = ['UNSEEN', ['FROM', leadEmail]];
                    const fetchOptions = {
                        bodies: ['HEADER', 'TEXT', ''],
                        markSeen: false,
                    };
                    const messages = await connection.search(searchCriteria, fetchOptions);
                    if (messages.length > 0) {
                        console.log(`Found ${messages.length} unread message(s) from ${leadEmail}`);
                    }
                    for (const message of messages) {
                        try {
                            const lead = await this.processMessage(userId, message);
                            if (lead) {
                                newLeads.push(lead);
                                // Mark as seen
                                await connection.addFlags(message.attributes.uid, '\\Seen');
                            }
                        }
                        catch (error) {
                            console.error(`Error processing email UID ${message.attributes.uid}:`, error);
                        }
                    }
                }
                catch (error) {
                    console.error(`Error checking emails from ${leadEmail}:`, error);
                }
            }
            connection.end();
            return newLeads;
        }
        catch (error) {
            console.error('Error polling IMAP inbox:', error);
            if (connection)
                connection.end();
            return [];
        }
    }
    /**
     * Process a single IMAP message
     */
    async processMessage(userId, message) {
        const allParts = message.parts.find(part => part.which === '');
        const idHeader = message.parts.find(part => part.which === 'HEADER');
        if (!allParts || !allParts.body) {
            console.warn('Skipping message with no body part');
            return null;
        }
        const parsed = await (0, mailparser_1.simpleParser)(allParts.body);
        const from = parsed.from?.value[0];
        if (!from || !from.address) {
            console.warn('Skipping message with no From address');
            return null;
        }
        const email = from.address.toLowerCase();
        // 1. Ignore noreply/system/marketing emails
        const ignorePatterns = [
            'noreply', 'no-reply', 'donotreply', 'mailer-daemon',
            'marketing', 'newsletter', 'updates', 'support', 'alert', 'notification',
            'facebook', 'linkedin', 'twitter', 'instagram', 'pinterest', 'tiktok',
            'google', 'microsoft', 'amazon', 'apple', 'service', 'info'
        ];
        if (ignorePatterns.some(pattern => email.includes(pattern))) {
            console.log(`Skipping ignored sender: ${email}`);
            return null;
        }
        const name = from.name || email.split('@')[0];
        const subject = parsed.subject || '(no subject)';
        const body = parsed.text || parsed.html || '(no body)'; // Prefer text
        const messageId = parsed.messageId || (0, uuid_1.v4)();
        const inReplyTo = parsed.inReplyTo;
        // Get or create lead scoped to this user
        let lead = await this.getOrCreateLead(userId, email, name);
        // Update name if we have a better one now (and the old one was just the email prefix)
        if (from.name && lead.name === email.split('@')[0] && from.name !== lead.name) {
            console.log(`Updating lead name from "${lead.name}" to "${from.name}"`);
            await database_1.default.query('UPDATE leads SET name = $1 WHERE id = $2', [from.name, lead.id]);
            lead.name = from.name;
        }
        // Store message
        await database_1.default.query(`INSERT INTO messages (id, lead_id, direction, gmail_thread_id, message_id, in_reply_to, subject, body, sent_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, datetime('now'))`, [
            (0, uuid_1.v4)(),
            lead.id,
            'inbound',
            null, // No Gmail thread ID in standard IMAP
            messageId,
            inReplyTo,
            subject,
            body,
        ]);
        console.log(`Stored inbound message from ${email}`);
        // Track analytics event for reply received
        await tracker_1.analyticsTracker.track('reply_received', userId, lead.id);
        return lead;
    }
    /**
     * Get or create lead by email scoped to user
     */
    async getOrCreateLead(userId, email, name) {
        const existing = await database_1.default.query('SELECT * FROM leads WHERE email = $1 AND user_id = $2', [email, userId]);
        if (existing.rows.length > 0) {
            return this.rowToLead(existing.rows[0]);
        }
        const leadId = (0, uuid_1.v4)();
        await database_1.default.query(`INSERT INTO leads (id, user_id, email, name, source, status, last_contact_at, created_at)
             VALUES ($1, $2, $3, $4, 'email', 'new', datetime('now'), datetime('now'))`, [leadId, userId, email, name || email.split('@')[0]]);
        const newLead = await database_1.default.query('SELECT * FROM leads WHERE id = $1', [leadId]);
        return this.rowToLead(newLead.rows[0]);
    }
    /**
     * Get the appropriate transporter (OAuth or SMTP) for a specific user
     */
    async getTransporter(userId) {
        // 1. Find user config
        try {
            const res = await database_1.default.query('SELECT email, access_token, refresh_token, google_id, google_app_password, google_account_email FROM users WHERE id = $1', [userId]);
            if (res.rows.length > 0) {
                const user = res.rows[0];
                // A. Try App Password (Preferred for IMAP/SMTP simplicity)
                // We use google_account_email if explicitly provided, otherwise fallback to their login email
                if (user.google_app_password) {
                    const senderEmail = user.google_account_email || user.email;
                    console.log(`Using App Password for sender: ${senderEmail}`);
                    return nodemailer_1.default.createTransport({
                        service: 'gmail',
                        auth: {
                            user: senderEmail,
                            pass: user.google_app_password,
                        },
                    });
                }
                // B. Try OAuth (Fallback)
                if (user.access_token) {
                    return nodemailer_1.default.createTransport({
                        service: 'gmail',
                        auth: {
                            type: 'OAuth2',
                            user: user.email,
                            clientId: config_1.config.googleClientId,
                            clientSecret: config_1.config.googleClientSecret,
                            refreshToken: user.refresh_token,
                            accessToken: user.access_token,
                        },
                    });
                }
            }
        }
        catch (error) {
            console.warn('Failed to load Google user for transport:', error);
        }
        // 2. Fallback to SMTP from env
        if (this.transporter)
            return this.transporter;
        // 3. Fallback/Init SMTP if not already done
        if (config_1.config.smtp.host) {
            this.transporter = nodemailer_1.default.createTransport({
                host: config_1.config.smtp.host,
                port: config_1.config.smtp.port,
                secure: config_1.config.smtp.port === 465,
                auth: {
                    user: config_1.config.smtp.user,
                    pass: config_1.config.smtp.pass,
                },
            });
            return this.transporter;
        }
        return null;
    }
    /**
     * Send email via SMTP
     */
    async sendEmail(userId, lead, subject, body, threadInfo, attachments // Support attachments (like ICS)
    ) {
        if (!config_1.config.enableRealEmail) {
            console.log(`[MOCK EMAIL] To: ${lead.email}, Subject: ${subject}`);
            await tracker_1.analyticsTracker.track('email_sent', userId, lead.id);
            return { sent: true, messageId: `mock-${(0, uuid_1.v4)()}` };
        }
        try {
            const transporter = await this.getTransporter(userId);
            if (!transporter) {
                console.error(`No email transport configured for user ${userId}`);
                return { sent: false, reason: 'No email transport configured' };
            }
            // Retrieve Sender config dynamically to ensure 'From:' matches the connected account
            const res = await database_1.default.query('SELECT email, google_account_email FROM users WHERE id = $1', [userId]);
            const user = res.rows[0] || {};
            const senderEmail = user.google_account_email || user.email;
            const mailOptions = {
                from: `"${config_1.config.businessName}" <${senderEmail}>`,
                to: lead.email,
                subject: subject,
                html: body,
                text: body.replace(/<[^>]*>?/gm, ''), // Simple strip HTML for fallback
            };
            // Add threading headers if replying
            if (threadInfo && threadInfo.message_id) {
                mailOptions.inReplyTo = threadInfo.message_id;
                mailOptions.references = threadInfo.message_id;
            }
            if (attachments) {
                mailOptions.attachments = attachments;
            }
            const info = await transporter.sendMail(mailOptions);
            const sentMessageId = info.messageId;
            // Store sent message
            await database_1.default.query(`INSERT INTO messages (id, lead_id, direction, message_id, in_reply_to, subject, body, sent_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'))`, [
                (0, uuid_1.v4)(),
                lead.id,
                'outbound',
                sentMessageId,
                threadInfo?.message_id,
                subject,
                body,
            ]);
            console.log(`Email sent to ${lead.email}, message ID: ${sentMessageId}`);
            // Track analytics event
            await tracker_1.analyticsTracker.track('email_sent', userId, lead.id);
            return { sent: true, messageId: sentMessageId };
        }
        catch (error) {
            console.error('Error sending email:', error);
            return { sent: false, reason: String(error) };
        }
    }
    /**
     * Generate ICS Calendar Invite
     */
    generateCalendarInvite(event, attendee) {
        const startDate = event.start;
        const year = startDate.getFullYear();
        const month = startDate.getMonth() + 1;
        const day = startDate.getDate();
        const hour = startDate.getHours();
        const minute = startDate.getMinutes();
        const { error, value } = ics.createEvent({
            start: [year, month, day, hour, minute],
            duration: { minutes: event.durationMinutes },
            title: event.title,
            description: event.description,
            location: event.location || 'Remote Video Call',
            url: event.url,
            status: 'CONFIRMED',
            busyStatus: 'BUSY',
            organizer: { name: config_1.config.businessName, email: config_1.config.smtp.user },
            attendees: [
                { name: attendee.name, email: attendee.email, rsvp: true, partstat: 'NEEDS-ACTION', role: 'REQ-PARTICIPANT' },
                { name: config_1.config.businessName, email: config_1.config.smtp.user, rsvp: true, partstat: 'ACCEPTED', role: 'CHAIR' }
            ]
        });
        if (error) {
            console.error('Error generating ICS:', error);
            return '';
        }
        return value || '';
    }
    /**
     * Get thread info for replying
     */
    async getThreadInfo(leadId) {
        const result = await database_1.default.query(`SELECT gmail_thread_id, message_id, subject 
             FROM messages 
             WHERE lead_id = $1 AND direction = 'inbound' 
             ORDER BY sent_at DESC 
             LIMIT 1`, [leadId]);
        if (result.rows.length === 0) {
            return null;
        }
        return {
            gmail_thread_id: result.rows[0].gmail_thread_id || '',
            message_id: result.rows[0].message_id || '',
            subject: result.rows[0].subject,
        };
    }
    rowToLead(row) {
        return {
            id: row.id,
            user_id: row.user_id,
            email: row.email,
            name: row.name,
            phone: row.phone,
            company: row.company,
            source: row.source,
            status: row.status,
            opted_out: !!row.opted_out,
            followup_count: row.followup_count || 0,
            last_contact_at: row.last_contact_at,
            next_action_at: row.next_action_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }
    async sendAdminReport(subject, html) {
        if (!config_1.config.enableRealEmail) {
            console.log(`[Shadow Mode] Admin Report "${subject}" would be sent.`);
            return;
        }
        try {
            await this.transporter.sendMail({
                from: `"${config_1.config.businessName}" <${config_1.config.gmailUserEmail}>`,
                to: config_1.config.gmailUserEmail, // Send to self
                subject: `📊 ${subject}`,
                html: html,
            });
            console.log(`Admin report sent: ${subject}`);
        }
        catch (error) {
            console.error('Failed to send admin report:', error);
        }
    }
}
exports.EmailService = EmailService;
exports.default = new EmailService();
//# sourceMappingURL=email-service.js.map