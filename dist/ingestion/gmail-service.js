"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GmailService = void 0;
const googleapis_1 = require("googleapis");
const config_1 = require("../config");
const database_1 = __importDefault(require("../config/database"));
const uuid_1 = require("uuid");
/**
 * Gmail API Service for monitoring and sending emails
 */
class GmailService {
    constructor() {
        this.oauth2Client = new googleapis_1.google.auth.OAuth2(config_1.config.googleClientId, config_1.config.googleClientSecret, 'urn:ietf:wg:oauth:2.0:oob' // For installed apps
        );
        this.oauth2Client.setCredentials({
            refresh_token: config_1.config.googleRefreshToken,
        });
        this.gmail = googleapis_1.google.gmail({ version: 'v1', auth: this.oauth2Client });
    }
    /**
     * Poll Gmail inbox for new unseen messages
     * Returns array of new leads from emails
     */
    async pollInbox() {
        try {
            console.log('Polling Gmail inbox...');
            const response = await this.gmail.users.messages.list({
                userId: 'me',
                labelIds: ['INBOX'],
                q: 'is:unread',
            });
            const messages = response.data.messages || [];
            console.log(`Found ${messages.length} unread messages`);
            const newLeads = [];
            for (const message of messages) {
                try {
                    const lead = await this.processMessage(message.id);
                    if (lead) {
                        newLeads.push(lead);
                        // Mark as read
                        await this.gmail.users.messages.modify({
                            userId: 'me',
                            id: message.id,
                            requestBody: {
                                removeLabelIds: ['UNREAD'],
                            },
                        });
                    }
                }
                catch (error) {
                    console.error(`Error processing message ${message.id}:`, error);
                }
            }
            return newLeads;
        }
        catch (error) {
            console.error('Error polling inbox:', error);
            return [];
        }
    }
    /**
     * Process a single Gmail message
     */
    async processMessage(messageId) {
        const msg = await this.gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full',
        });
        const headers = msg.data.payload.headers;
        const fromHeader = headers.find((h) => h.name === 'From');
        const subjectHeader = headers.find((h) => h.name === 'Subject');
        const messageIdHeader = headers.find((h) => h.name === 'Message-ID');
        if (!fromHeader) {
            console.warn(`Message ${messageId} has no From header`);
            return null;
        }
        // Extract email and name from "Name <email@example.com>"
        const fromMatch = fromHeader.value.match(/(.+?)\s*<(.+?)>/);
        const email = fromMatch ? fromMatch[2] : fromHeader.value;
        const name = fromMatch ? fromMatch[1].trim() : undefined;
        // Get or create lead
        const lead = await this.getOrCreateLead(email, name);
        // Extract body
        const body = this.extractBody(msg.data.payload);
        // Store message
        await database_1.default.query(`INSERT INTO messages (id, lead_id, direction, gmail_thread_id, message_id, subject, body, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'))`, [
            (0, uuid_1.v4)(),
            lead.id,
            'inbound',
            msg.data.threadId,
            messageIdHeader?.value,
            subjectHeader?.value || '(no subject)',
            body,
        ]);
        return lead;
    }
    /**
     * Extract email body from Gmail payload
     */
    extractBody(payload) {
        if (payload.body?.data) {
            return Buffer.from(payload.body.data, 'base64').toString('utf-8');
        }
        if (payload.parts) {
            for (const part of payload.parts) {
                if (part.mimeType === 'text/plain' && part.body?.data) {
                    return Buffer.from(part.body.data, 'base64').toString('utf-8');
                }
            }
            // Fallback to HTML
            for (const part of payload.parts) {
                if (part.mimeType === 'text/html' && part.body?.data) {
                    return Buffer.from(part.body.data, 'base64').toString('utf-8');
                }
            }
        }
        return '(no body)';
    }
    /**
     * Get or create lead by email
     */
    async getOrCreateLead(email, name) {
        // Check if lead exists
        const existing = await database_1.default.query('SELECT * FROM leads WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return this.rowToLead(existing.rows[0]);
        }
        // Create new lead
        const leadId = (0, uuid_1.v4)();
        await database_1.default.query(`INSERT INTO leads (id, email, name, source, status, last_contact_at, created_at)
       VALUES ($1, $2, $3, 'email', 'new', datetime('now'), datetime('now'))`, [leadId, email, name || email.split('@')[0]]);
        const newLead = await database_1.default.query('SELECT * FROM leads WHERE id = $1', [leadId]);
        return this.rowToLead(newLead.rows[0]);
    }
    /**
     * Send email via Gmail API with threading support
     */
    async sendEmail(lead, subject, body, threadInfo) {
        try {
            // Build email message
            const email = this.buildEmail(lead.email, subject, body, threadInfo);
            const response = await this.gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: email,
                    threadId: threadInfo?.gmail_thread_id,
                },
            });
            const sentMessageId = response.data.id;
            // Store sent message
            await database_1.default.query(`INSERT INTO messages (lead_id, direction, gmail_thread_id, message_id, subject, body, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))`, [
                lead.id,
                'outbound',
                threadInfo?.gmail_thread_id || sentMessageId,
                sentMessageId,
                subject,
                body,
            ]);
            console.log(`Email sent to ${lead.email}, message ID: ${sentMessageId}`);
            return { sent: true, messageId: sentMessageId };
        }
        catch (error) {
            console.error('Error sending email:', error);
            return { sent: false, reason: String(error) };
        }
    }
    /**
     * Build RFC 2822 formatted email
     */
    buildEmail(to, subject, body, threadInfo) {
        const lines = [
            `To: ${to}`,
            `From: ${config_1.config.gmailUserEmail}`,
            `Subject: ${subject}`,
            'Content-Type: text/plain; charset=utf-8',
        ];
        if (threadInfo) {
            lines.push(`In-Reply-To: ${threadInfo.message_id}`);
            lines.push(`References: ${threadInfo.message_id}`);
        }
        lines.push('');
        lines.push(body);
        const email = lines.join('\r\n');
        return Buffer.from(email).toString('base64url');
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
            gmail_thread_id: result.rows[0].gmail_thread_id,
            message_id: result.rows[0].message_id,
            subject: result.rows[0].subject,
        };
    }
    /**
     * Convert database row to Lead object
     */
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
            opted_out: row.opted_out === 1 || row.opted_out === true,
            followup_count: row.followup_count || 0,
            last_contact_at: row.last_contact_at,
            next_action_at: row.next_action_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }
}
exports.GmailService = GmailService;
exports.default = new GmailService();
//# sourceMappingURL=gmail-service.js.map