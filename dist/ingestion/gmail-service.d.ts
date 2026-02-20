import { Lead, EmailThreadInfo } from '../types';
/**
 * Gmail API Service for monitoring and sending emails
 */
export declare class GmailService {
    private gmail;
    private oauth2Client;
    constructor();
    /**
     * Poll Gmail inbox for new unseen messages
     * Returns array of new leads from emails
     */
    pollInbox(): Promise<Lead[]>;
    /**
     * Process a single Gmail message
     */
    private processMessage;
    /**
     * Extract email body from Gmail payload
     */
    private extractBody;
    /**
     * Get or create lead by email
     */
    private getOrCreateLead;
    /**
     * Send email via Gmail API with threading support
     */
    sendEmail(lead: Lead, subject: string, body: string, threadInfo?: EmailThreadInfo): Promise<{
        sent: boolean;
        messageId?: string;
        reason?: string;
    }>;
    /**
     * Build RFC 2822 formatted email
     */
    private buildEmail;
    /**
     * Get thread info for replying
     */
    getThreadInfo(leadId: string): Promise<EmailThreadInfo | null>;
    /**
     * Convert database row to Lead object
     */
    private rowToLead;
}
declare const _default: GmailService;
export default _default;
//# sourceMappingURL=gmail-service.d.ts.map